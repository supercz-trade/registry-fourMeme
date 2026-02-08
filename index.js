// index.js
// four.meme MAIN DISPATCHER
// FINAL MODE — CREATE TOKEN + TRADE PIPELINE (POSTGRES VERSION)

import { ethers } from "ethers";
import "dotenv/config";

// ================= PRICE =================
import { getBNBPrice } from "./price/bnbPrice.js";
import { startPairPriceCache } from "./price/pairPriceCache.js";

// ================= MONITOR =================
import { handleCreateToken } from "./monitoring/createToken.js";
import { detectBuySell } from "./monitoring/detectBuySell.js";

// ================= STORAGE (POSTGRES) =================
import {
  saveTokenLaunchInfo,
  loadTokenLaunchInfo
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

const MANAGER = safeLower(process.env.FOUR_MEME_MANAGER);
const CREATE_TOKEN_SELECTOR = "0x519ebb10";

// ================= PROVIDER =================
const provider = new ethers.WebSocketProvider(process.env.BSC_WSS);

// ================= PRICE =================
let BNB_USD = 0;

async function updateBNBPrice() {
  try {
    BNB_USD = await getBNBPrice();
  } catch {
    // keep last value
  }
}

// ================= INIT =================
await updateBNBPrice();
setInterval(updateBNBPrice, 60_000);
startPairPriceCache();

console.log("[SYSTEM] dispatcher started (POSTGRES MODE)");

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

  const block = await provider.getBlock(blockNumber);

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

    if (!tx?.data) continue;

    // ====================================================
    // ================= CREATE TOKEN =====================
    // ====================================================
    if (
      safeLower(tx.to) === MANAGER &&
      tx.data.startsWith(CREATE_TOKEN_SELECTOR)
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

        if (!result?.registry?.tokenAddress) continue;

        const tokenAddress = result.registry.tokenAddress;

        // ===== SAVE REGISTRY =====
        await saveTokenLaunchInfo({
          ...result.registry,
          registryMode: "ONCHAIN",
          registryFrom: "internal"
        });

        // ===== SAVE GENESIS TX =====
        await saveTransactions(tokenAddress, [result.genesisTx]);

        console.log("\n[CREATE TOKEN]");
        console.log(JSON.stringify(result.registry, null, 2));

      } catch {
        // silent
      }

      continue;
    }

    // ====================================================
    // ================= BUY / SELL =======================
    // ====================================================

    const tokenTransfers = receipt.logs.filter(
      l =>
        l.topics?.[0] ===
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    );

    if (!tokenTransfers.length) continue;

    const tokenAddress = tokenTransfers[0].address.toLowerCase();

    // ===== ENSURE REGISTRY =====
    let tokenInfo = await loadTokenLaunchInfo(tokenAddress);

    if (!tokenInfo) {
      const imported = await fetchTokenMeta(tokenAddress);
      if (!imported) continue;

      await saveTokenLaunchInfo({
        ...imported,
        registryMode: "IMPORTED",
        registryFrom: "four_meme_api"
      });

      tokenInfo = imported;
    }

    // ===== DETECT BUY / SELL =====
    const candleTime = Math.floor(block.timestamp / 60) * 60;

    const events = detectBuySell({
      tx,
      receipt,
      tokenAddress,
      manager: MANAGER,
      creator: tokenInfo.creator,
      blockTime: candleTime,
      bnbUSD: BNB_USD
    });

    if (!events.length) continue;

    // ===== SAVE EVENTS (SOURCE OF TRUTH) =====
    await saveTransactions(tokenAddress, events);
  }

  if (seenTx.size > 10_000) seenTx.clear();
});
