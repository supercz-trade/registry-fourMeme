// index.js
// FINAL — SuperCZ four.meme MAIN DISPATCHER
// Engine-first, Postgres mode

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

// ================= SERVICES =================
import { fetchTokenMeta } from "./services/fetchTokenMeta_api.js";

// ================= SAFE =================
const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : null);

// ================= ENV =================
if (!process.env.FOUR_MEME_MANAGER) {
  throw new Error("FOUR_MEME_MANAGER env missing");
}
if (!process.env.BSC_WSS) {
  throw new Error("BSC_WSS env missing");
}

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
  } catch {
    console.log("[PRICE] failed update, keep last value");
  }
}

// ================= INIT =================
await updateBNBPrice();
setInterval(updateBNBPrice, 60_000);
startPairPriceCache();

console.log("[SYSTEM] SuperCZ dispatcher started");

// ================= STATE =================
const seenTx = new Set();

// ================= MAIN LOOP =================
provider.on("block", async (blockNumber) => {
  let logs;

  try {
    logs = await provider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      address: MANAGER
    });
  } catch {
    return;
  }

  if (!logs.length) return;

  let block;
  try {
    block = await provider.getBlock(blockNumber);
  } catch {
    return;
  }

  const candleTime = Math.floor(block.timestamp / 60) * 60;

  console.log(`[BLOCK] ${blockNumber} | logs=${logs.length}`);

  for (const log of logs) {
    const txHash = log.transactionHash;
    if (seenTx.has(txHash)) continue;
    seenTx.add(txHash);

    let tx, receipt;
    try {
      tx = await provider.getTransaction(txHash);
      receipt = await provider.getTransactionReceipt(txHash);
    } catch {
      continue;
    }

    if (!tx || !receipt) continue;

    console.log(`[TX] ${txHash}`);

    // ====================================================
    // ================= CREATE TOKEN =====================
    // ====================================================
    if (
      safeLower(tx.to) === MANAGER &&
      tx.data?.startsWith(CREATE_TOKEN_SELECTOR)
    ) {
      try {
        console.log("[DETECT] CREATE_TOKEN");

        const result = await handleCreateToken({
          tx,
          receipt,
          block,
          manager: MANAGER,
          bnbUSD: BNB_USD,
          provider
        });

        if (!result?.registry?.tokenAddress) {
          console.log("[CREATE][SKIP] no registry result");
          continue;
        }

        console.log("[CREATE][RESULT]", {
          token: result.registry.tokenAddress,
          creator: result.registry.creator,
          supply: result.registry.totalSupply,
          genesisPrice: result.genesisTx?.priceUSD,
          genesisMcap: result.genesisTx?.marketcapAtTxUSD
        });

        await saveTokenLaunchInfo({
          ...result.registry,
          registryMode: "ONCHAIN",
          registryFrom: "internal"
        });

        await saveTransactions(
          result.registry.tokenAddress,
          [result.genesisTx]
        );

        console.log(`[CREATE][SAVED] ${result.registry.tokenAddress}`);
      } catch (err) {
        console.log("[CREATE][ERROR]", err?.message);
      }

      continue;
    }

    // ====================================================
    // ================ TOKEN TRANSFERS ===================
    // ====================================================
    const tokenTransfers = receipt.logs.filter(
      l =>
        l.topics?.[0] ===
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    );

    if (!tokenTransfers.length) continue;

    const tokenAddress = tokenTransfers[0].address.toLowerCase();

    // ====================================================
    // ================= ENSURE TOKEN =====================
    // ====================================================
    let tokenInfo = await loadTokenLaunchInfo(tokenAddress);

    if (!tokenInfo) {
      console.log(`[TOKEN][IMPORT] ${tokenAddress}`);

      const imported = await fetchTokenMeta(tokenAddress);
      if (!imported) continue;

      await saveTokenLaunchInfo({
        ...imported,
        registryMode: "IMPORTED",
        registryFrom: "four_meme_api"
      });

      tokenInfo = imported;
    }

    // ====================================================
    // ============== ADD LIQUIDITY =======================
    // ====================================================
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
      console.log("[MIGRATION][EVENT]", liqEvents[0]);

      await saveTransactions(tokenAddress, liqEvents);
      await markTokenMigrated(tokenAddress);

      console.log(`[MIGRATION][DONE] ${tokenAddress}`);
      continue;
    }

    // ====================================================
    // ================= BUY / SELL =======================
    // ====================================================
    const tradeEvents = await detectBuySell({
      tx,
      receipt,
      tokenAddress,
      manager: MANAGER,
      creator: tokenInfo.creator,
      blockTime: candleTime,
      bnbUSD: BNB_USD
    });

    if (!tradeEvents.length) continue;

    for (const ev of tradeEvents) {
      console.log("[TRADE][EVENT]", {
        side: ev.side,
        wallet: ev.wallet,
        tokenAmount: ev.tokenAmount,
        price: ev.priceUSD,
        mcap: ev.marketcapAtTxUSD,
        src: ev.priceSource
      });
    }

    await saveTransactions(tokenAddress, tradeEvents);

    console.log(
      `[TRADE][SAVED] ${tokenAddress} events=${tradeEvents.length}`
    );
  }

  if (seenTx.size > 10_000) seenTx.clear();
});
