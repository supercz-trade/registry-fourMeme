// test/detectBuySellByTx.js
// Manual test for detectBuySell using single txHash

import "dotenv/config";
import { ethers } from "ethers";

import { detectBuySell } from "../monitoring/detectBuySell.js";
import { startPairPriceCache } from "../price/pairPriceCache.js";
import { getBNBPrice } from "../price/bnbPrice.js";

// ================= CONFIG =================
// GANTI TX HASH DI SINI
const TX_HASH = "0xf2fd742da165e89945a593464c5104413594b3cace054de91141fd50e6047b0f";

// Token info (WAJIB kamu isi manual untuk test)
const TOKEN_ADDRESS = "0x219bDb86c436c42Ad96334c1e33229b870764444".toLowerCase();
const CREATOR = "0x29b3bb089340042c93b1562f72e7f32ff0e1b34c".toLowerCase();

// four.meme manager
const MANAGER = "0x5c952063c7fc8610ffdb798152d69f0b9550762b";

// ================= PROVIDER =================
// Gunakan HTTP RPC (AMAN untuk testing)
const provider = new ethers.JsonRpcProvider(
  process.env.BSC_RPC || "https://bsc-dataseed.binance.org"
);

// ================= INIT =================
startPairPriceCache();

const bnbUSD = await getBNBPrice();
console.log("[INIT] BNB USD =", bnbUSD);

// ================= FETCH TX =================
const tx = await provider.getTransaction(TX_HASH);
if (!tx) {
  console.error("TX not found");
  process.exit(1);
}

const receipt = await provider.getTransactionReceipt(TX_HASH);
const block = await provider.getBlock(tx.blockNumber);

if (!receipt || !block) {
  console.error("Receipt / Block not found");
  process.exit(1);
}

// ================= RUN DETECTOR =================
const events = detectBuySell({
  tx,
  receipt,
  tokenAddress: TOKEN_ADDRESS,
  manager: MANAGER,
  creator: CREATOR,
  blockTime: block.timestamp,
  bnbUSD
});

// ================= RESULT =================
console.log("\n=== BUY / SELL EVENTS ===");

if (events.length === 0) {
  console.log("No BUY / SELL detected in this tx");
} else {
  for (const e of events) {
    console.dir(e, { depth: null });
  }
}

process.exit(0);
