// test/testDetectBuySell.js
// TEST detectBuySell BY TX HASH

import { ethers } from "ethers";
import "dotenv/config";

import { detectBuySell } from "../monitoring/detectBuySell.js";
import { loadTokenLaunchInfo } from "../storage/tokenStore.pg.js";
import { getBNBPrice } from "../price/bnbPrice.js";

const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : null);

if (!process.env.BSC_RPC) {
  throw new Error("BSC_RPC env missing");
}

if (!process.env.FOUR_MEME_MANAGER) {
  throw new Error("FOUR_MEME_MANAGER env missing");
}

const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC);

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.log("Usage: node testDetectBuySell.js <txHash>");
    process.exit(1);
  }

  console.log("[TEST] TX:", txHash);

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    console.log("[ERROR] TX not found");
    return;
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    console.log("[ERROR] Receipt not found");
    return;
  }

  const block = await provider.getBlock(tx.blockNumber);
  const candleTime = Math.floor(block.timestamp / 60) * 60;

  const BNB_USD = await getBNBPrice();
  console.log("[PRICE] BNB =", BNB_USD);

  // detect token from first transfer
  const TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  let tokenAddress = null;
  for (const log of receipt.logs) {
    if (log.topics?.[0] === TRANSFER_TOPIC && log.topics.length === 3) {
      tokenAddress = log.address.toLowerCase();
      break;
    }
  }

  if (!tokenAddress) {
    console.log("[INFO] No ERC20 transfer found");
    return;
  }

  console.log("[INFO] Token detected:", tokenAddress);

  let tokenInfo = await loadTokenLaunchInfo(tokenAddress);

  if (!tokenInfo) {
    console.log("[WARN] Token not in DB → creator set null");
  }

  const events = await detectBuySell({
    tx,
    receipt,
    tokenAddress,
    manager: safeLower(process.env.FOUR_MEME_MANAGER),
    creator: tokenInfo?.creator ?? null,
    blockTime: candleTime,
    bnbUSD: BNB_USD
  });

  console.log("=================================");
  console.log("[RESULT] EVENTS:", events.length);
  console.dir(events, { depth: null });
  console.log("=================================");
}

main().catch((err) => {
  console.error("[FATAL]", err);
});
