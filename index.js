// index.js
// FINAL — SuperCZ four.meme MAIN DISPATCHER
// Engine-first, Postgres mode + Centralized Error Handling
// [FIXED] strict multi-token extraction, no blind skip

import { ethers } from "ethers";
import "dotenv/config";

// ================= PRICE =================
import { getBNBPrice } from "./price/bnbPrice.js";
import { startPairPriceCache } from "./price/pairPriceCache.js";

// ================= MONITOR =================
import { handleCreateToken } from "./monitoring/createToken.js";
import { detectBuySell } from "./monitoring/detectBuySell.js";
import { detectAddLiquidity } from "./monitoring/detectAddLiquidity.js";

// ================= STORAGE =================
import {
  saveTokenLaunchInfo,
  loadTokenLaunchInfo,
  markTokenMigrated
} from "./storage/tokenStore.pg.js";

import {
  saveTransactions
} from "./storage/transactionStore.pg.js";

// ================= ERROR STORAGE =================
import {
  saveNull,
  saveException
} from "./storage/errorHandling.pg.js";

import {
  tryQualifySingleToken,
  cleanupDeadTokensDaily
} from "./maintenance/tokenLifecycle.js";

// ================= SERVICES =================
import { fetchTokenMeta } from "./services/fetchTokenMeta_api.js";

// ================= SAFE =================
const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : null);

// ================= ENV =================
if (!process.env.FOUR_MEME_MANAGER)
  throw new Error("FOUR_MEME_MANAGER env missing");

if (!process.env.BSC_WSS)
  throw new Error("BSC_WSS env missing");

const MANAGER = safeLower(process.env.FOUR_MEME_MANAGER);
const CREATE_TOKEN_SELECTOR = "0x519ebb10";

// ================= PROVIDER =================
const provider = new ethers.WebSocketProvider(process.env.BSC_WSS);

// ================= PRICE =================
let BNB_USD = 0;

async function updateBNBPrice() {
  try {
    BNB_USD = await getBNBPrice();
    console.log(`[PRICE] BNB = $${BNB_USD}`);
  } catch (err) {
    await saveException("SYSTEM", err, {
      moduleStage: "UPDATE_BNB_PRICE"
    });
  }
}

await updateBNBPrice();
setInterval(updateBNBPrice, 60_000);
startPairPriceCache();

console.log("[SYSTEM] SuperCZ dispatcher started");

// ================= STATE =================
const seenTx = new Set();

// ================= HELPER =================
function buildTxContext(tx, blockNumber, tokenAddress = null, stage = null) {
  return {
    blockNumber,
    tokenAddress,
    sender: tx?.from,
    toAddress: tx?.to,
    bnbValue: tx?.value ? Number(tx.value) / 1e18 : 0,
    rawMethod: tx?.data?.slice(0, 10),
    moduleStage: stage
  };
}

// [NEW]
function logEvents(tag, tokenAddress, events) {
  if (!events || !events.length) return;

  console.log(`\n[EVENT:${tag}] token=${tokenAddress} count=${events.length}`);
  for (const ev of events) {
    console.log(JSON.stringify(ev, null, 2));
  }
}

// ================= CONSTANT =================
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const MIN_MARKETCAP_USD = 1000;

// ================= MAIN LOOP =================
provider.on("block", async (blockNumber) => {
  let logs;

  try {
    logs = await provider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      address: MANAGER
    });
  } catch (err) {
    await saveException("BLOCK_" + blockNumber, err, {
      blockNumber,
      moduleStage: "GET_LOGS"
    });
    return;
  }

  if (!logs.length) return;

  let block;
  try {
    block = await provider.getBlock(blockNumber);
  } catch (err) {
    await saveException("BLOCK_" + blockNumber, err, {
      blockNumber,
      moduleStage: "GET_BLOCK"
    });
    return;
  }

  const candleTime = Math.floor(block.timestamp / 60) * 60;

  for (const log of logs) {
    const txHash = log.transactionHash;
    if (seenTx.has(txHash)) continue;
    seenTx.add(txHash);

    let tx, receipt;

    try {
      tx = await provider.getTransaction(txHash);
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (err) {
      await saveException(txHash, err, {
        blockNumber,
        moduleStage: "FETCH_TX_RECEIPT"
      });
      continue;
    }

    if (!tx || !receipt) {
      await saveNull(txHash, "TX_OR_RECEIPT_NULL", {
        blockNumber
      });
      continue;
    }

    // ================= CREATE TOKEN =================
    if (
      safeLower(tx.to) === MANAGER &&
      tx.data?.startsWith(CREATE_TOKEN_SELECTOR)
    ) {
      try {
        const result = await handleCreateToken({
          tx,
          receipt,
          block,
          manager: MANAGER,
          bnbUSD: BNB_USD,
          provider
        });

        if (result?.registry?.tokenAddress) {

          // [NEW]
          console.log("\n[CREATE_TOKEN]");
          console.log(JSON.stringify(result.registry, null, 2));
          console.log(JSON.stringify(result.genesisTx, null, 2));

          await saveTokenLaunchInfo({
            ...result.registry,
            registryMode: "ONCHAIN",
            registryFrom: "internal"
          });

          await saveTransactions(
            result.registry.tokenAddress,
            [result.genesisTx]
          );
        }

      } catch (err) {
        await saveException(
          txHash,
          err,
          buildTxContext(tx, blockNumber, null, "CREATE_TOKEN")
        );
      }

      continue;
    }

    // ================= EXTRACT ALL TOKENS =================
    const tokenSet = new Set();

    for (const l of receipt.logs) {
      if (l.topics?.[0] === ERC20_TRANSFER_TOPIC) {
        tokenSet.add(l.address.toLowerCase());
      }
    }

    if (!tokenSet.size) continue;

    // ================= PROCESS EACH TOKEN =================
    for (const tokenAddress of tokenSet) {

      let tokenInfo = await loadTokenLaunchInfo(tokenAddress);

      // ================= IMPORT IF NOT EXISTS =================
      if (!tokenInfo) {
        try {
          const imported = await fetchTokenMeta(tokenAddress);

          if (imported) {
            await saveTokenLaunchInfo({
              ...imported,
              registryMode: "IMPORTED",
              registryFrom: "four_meme_api"
            });
            tokenInfo = imported;
          } else {
            continue;
          }

        } catch (err) {
          await saveException(
            txHash,
            err,
            buildTxContext(tx, blockNumber, tokenAddress, "IMPORT_TOKEN_META")
          );
          continue;
        }
      }

      // ================= ADD LIQUIDITY =================
      try {
        const liqEvents = detectAddLiquidity({
          tx,
          receipt,
          tokenAddress,
          manager: MANAGER,
          creator: tokenInfo.creator,
          blockTime: candleTime,
          bnbUSD: BNB_USD
        });

        if (liqEvents.length) {

          // [NEW]
          logEvents("ADD_LIQUIDITY", tokenAddress, liqEvents);

          await saveTransactions(tokenAddress, liqEvents);
          await markTokenMigrated(tokenAddress);
          continue;
        }

      } catch (err) {
        await saveException(
          txHash,
          err,
          buildTxContext(tx, blockNumber, tokenAddress, "DETECT_ADD_LIQUIDITY")
        );
        continue;
      }

      // ================= BUY / SELL =================
      try {
        const tradeEvents = await detectBuySell({
          tx,
          receipt,
          tokenAddress,
          manager: MANAGER,
          creator: tokenInfo.creator,
          blockTime: candleTime,
          bnbUSD: BNB_USD
        });

        if (tradeEvents.length) {

          // [NEW] Filter low marketcap
          const validEvents = [];
          for (const ev of tradeEvents) {
            if (
              typeof ev.marketcapAtTxUSD === "number" &&
              ev.marketcapAtTxUSD < MIN_MARKETCAP_USD
            ) {
              await saveException(
                ev.txHash,
                new Error("MARKETCAP_BELOW_THRESHOLD"),
                {
                  ...ev,
                  moduleStage: "FILTER_MARKETCAP",
                  threshold: MIN_MARKETCAP_USD
                }
              );
              continue;
            }

            validEvents.push(ev);
          }

          if (validEvents.length) {

            // [NEW]
            logEvents("TRADE", tokenAddress, validEvents);

            await saveTransactions(tokenAddress, validEvents);

            // [NEW] per-token qualify trigger
            try {
              await tryQualifySingleToken(tokenAddress);
            } catch (err) {
              await saveException(
                txHash,
                err,
                buildTxContext(tx, blockNumber, tokenAddress, "TRY_QUALIFY")
              );
            }
          }
        }

      } catch (err) {
        await saveException(
          txHash,
          err,
          buildTxContext(tx, blockNumber, tokenAddress, "DETECT_BUY_SELL")
        );
      }

    }
  }

  // [NEW] daily dead cleanup trigger (light guard inside fn)
  try {
    await cleanupDeadTokensDaily();
  } catch (err) {
    await saveException("SYSTEM", err, {
      moduleStage: "CLEANUP_DEAD_DAILY"
    });
  }

  if (seenTx.size > 10_000) seenTx.clear();
});
