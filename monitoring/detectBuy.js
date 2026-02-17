// monitoring/detectBuy.js
// FINAL ENGINE — deterministic spend detection

import { ethers } from "ethers";
import { resolveBondingPrice } from "../services/helper.js";
import { getPairPriceUSD } from "../price/pairPriceCache.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOKEN_DECIMALS = 18;
const TOTAL_SUPPLY = 1_000_000_000;
const FOUR_MEME_FEE = 0.01;

const PAIR_WHITELIST = {
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": { symbol: "USD1", decimals: 18, stable: true },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, stable: true },
  "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2": { symbol: "USDC", decimals: 18, stable: true },
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": { symbol: "CAKE", decimals: 18, stable: false },
  "0x000ae314e2a2172a039b26378814c252734f556a": { symbol: "ASTER", decimals: 18, stable: false }
};

function addrFromTopic(topic) {
  return "0x" + topic.slice(26);
}

function detectToken(receipt, managerAddr) {
  const counts = {};

  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const addr = log.address.toLowerCase();
    if (PAIR_WHITELIST[addr]) continue;
    if (addr === managerAddr) continue;

    counts[addr] = (counts[addr] || 0) + 1;
  }

  let best = null;
  let max = 0;

  for (const addr in counts) {
    if (counts[addr] > max) {
      best = addr;
      max = counts[addr];
    }
  }

  return best;
}

function detectExecutedSpend(receipt, managerAddr) {
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const meta = PAIR_WHITELIST[log.address.toLowerCase()];
    if (!meta) continue;

    const to = addrFromTopic(log.topics[2]).toLowerCase();
    if (to !== managerAddr) continue;

    const amount = Number(
      ethers.formatUnits(BigInt(log.data), meta.decimals)
    );

    if (amount <= 0) continue;

    const usd = meta.stable
      ? amount
      : amount * (getPairPriceUSD(meta.symbol) || 0);

    return {
      spendAmount: amount,
      spendUSD: usd,
      spendSymbol: meta.symbol,
      spendType: "EXECUTED"
    };
  }

  return null;
}

export async function detectBuy({
  tx,
  receipt,
  manager,
  creator,
  blockTime,
  bnbUSD
}) {
  const events = [];
  if (!tx || !receipt || !manager) return events;

  const managerAddr = manager.toLowerCase();
  const creatorAddr = creator?.toLowerCase() ?? null;

  const tokenAddr = detectToken(receipt, managerAddr);
  if (!tokenAddr) return events;

  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.address.toLowerCase() !== tokenAddr) continue;

    const from = addrFromTopic(log.topics[1]).toLowerCase();
    const to = addrFromTopic(log.topics[2]).toLowerCase();

    if (from !== managerAddr) continue;

    const tokenAmount = Number(
      ethers.formatUnits(BigInt(log.data), TOKEN_DECIMALS)
    );
    if (tokenAmount <= 0) continue;

    const userWallet = to;

    /* ==========================
       PRIORITY 1 — EXECUTED
    =========================== */

    let spend = detectExecutedSpend(receipt, managerAddr);

    let priceUSD;
    let marketcapUSD;
    let priceSource;

    /* ==========================
       PRIORITY 2 — HELPER
    =========================== */

    if (!spend) {
      const helper = await resolveBondingPrice(tokenAddr, bnbUSD);
      if (!helper || !helper.priceUSD) continue;

      priceUSD = helper.priceUSD;
      marketcapUSD = helper.marketcapUSD;
      priceSource = helper.source;

      const spendUSD = priceUSD * tokenAmount * (1 - FOUR_MEME_FEE);

      spend = {
        spendAmount: spendUSD / bnbUSD,
        spendUSD,
        spendSymbol: "BNB",
        spendType: "STATE_INFERRED"
      };
    } else {
      priceUSD = spend.spendUSD / tokenAmount;
      marketcapUSD = priceUSD * TOTAL_SUPPLY;
      priceSource = "EXECUTED";
    }

    events.push({
      type: "TRADE",
      side: "BUY",
      txHash: tx.hash,
      tokenAddress: tokenAddr,
      wallet: userWallet,
      isDev: creatorAddr ? userWallet === creatorAddr : false,
      tokenAmount,
      spendAmount: spend.spendAmount,
      spendSymbol: spend.spendSymbol,
      spendUSD: spend.spendUSD,
      spendType: spend.spendType,
      priceUSD,
      marketcapAtTxUSD: marketcapUSD,
      priceSource,
      time: blockTime
    });
  }

  return events;
}
