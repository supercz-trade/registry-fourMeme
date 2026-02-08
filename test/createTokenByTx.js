// test/createTokenByTx.js
import "dotenv/config";
import { ethers } from "ethers";

import { handleCreateToken } from "../monitoring/createToken.js";
import { startPairPriceCache } from "../price/pairPriceCache.js";
import { getBNBPrice } from "../price/bnbPrice.js";

// ================= CONFIG =================
const TX_HASH = "0xf25612c40f1699a53c642e90c1d5a9bf2685405e1a99a4050c2131fa416dbc00";
const MANAGER = "0x5c952063c7fc8610ffdb798152d69f0b9550762b";

// ================= PROVIDER =================
const provider = new ethers.JsonRpcProvider(
  "https://bsc-dataseed.binance.org"
);

// ================= INIT =================
startPairPriceCache();

const bnbUSD = await getBNBPrice();
console.log("[INIT] BNB USD =", bnbUSD);

// ================= FETCH TX DATA =================
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

// ================= RUN CREATE TOKEN =================
const result = await handleCreateToken({
  tx,
  receipt,
  block,
  manager: MANAGER,
  bnbUSD,
  provider
});

// ================= RESULT =================
console.log("\n=== CREATE TOKEN RESULT ===");
console.dir(result, { depth: null });

process.exit(0);
