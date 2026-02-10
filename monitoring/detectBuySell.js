// monitoring/detectBuySell.js
// FINAL — TRADE EVENT PRODUCER (ONCHAIN, ENGINE-FIRST, FIXED)

import { ethers } from "ethers";
import { getPairPriceUSD } from "../price/pairPriceCache.js";
import { resolveBondingPrice } from "../services/helper.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOKEN_DECIMALS = 18;
const TOTAL_SUPPLY = 1_000_000_000;
const FOUR_MEME_FEE = 0.01; // 1%

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

export async function detectBuySell({
  tx,
  receipt,
  tokenAddress,
  manager,
  creator,
  blockTime,
  bnbUSD
}) {
  const events = [];
  if (!tx || !receipt) return events;

  const tokenAddr = tokenAddress.toLowerCase();
  const managerAddr = manager.toLowerCase();
  const creatorAddr = creator?.toLowerCase() ?? null;

  // ================= PAIR SPEND =================
  let pairSpend = {
    symbol: "BNB",
    amount: 0,
    stable: false,
    address: null
  };

  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const to = addrFromTopic(log.topics[2]).toLowerCase();
    const addr = log.address.toLowerCase();

    if (to === managerAddr && PAIR_WHITELIST[addr]) {
      const meta = PAIR_WHITELIST[addr];
      pairSpend = {
        symbol: meta.symbol,
        amount: Number(ethers.formatUnits(BigInt(log.data), meta.decimals)),
        stable: meta.stable,
        address: addr
      };
    }
  }

  // ================= SPEND USD =================
  let spendUSD = 0;

  if (!pairSpend.address) {
    const bnbAmount = Number(ethers.formatEther(tx.value));
    spendUSD = bnbAmount * bnbUSD;
  } else if (pairSpend.stable) {
    spendUSD = pairSpend.amount;
  } else {
    const px = getPairPriceUSD(pairSpend.symbol);
    if (px) spendUSD = pairSpend.amount * px;
  }

  // ================= TOKEN FLOW =================
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.address.toLowerCase() !== tokenAddr) continue;

    const from = addrFromTopic(log.topics[1]).toLowerCase();
    const to = addrFromTopic(log.topics[2]).toLowerCase();

    const tokenAmount = Number(
      ethers.formatUnits(BigInt(log.data), TOKEN_DECIMALS)
    );
    if (tokenAmount <= 0) continue;

    const side =
      from === managerAddr ? "BUY" :
        to === managerAddr ? "SELL" : null;

    if (!side) continue;

    // ================= PRICE & SPEND =================
    let priceUSD = null;
    let marketcapUSD = null;
    let priceSource = null;

    let spendAmount = null;
    let spendSymbol = null;
    let spendType = null;
    let finalSpendUSD = null;

    // ---------- PAIR BUY ----------
    if (side === "BUY" && spendUSD > 0) {
      priceUSD = spendUSD / tokenAmount;
      marketcapUSD = priceUSD * TOTAL_SUPPLY;
      priceSource = "PAIR";

      if (!pairSpend.address) {
        spendAmount = Number(ethers.formatEther(tx.value));
        spendSymbol = "BNB";
      } else {
        spendAmount = pairSpend.amount;
        spendSymbol = pairSpend.symbol;
      }

      finalSpendUSD = spendUSD;
      spendType = "EXECUTED";
    }

    // ---------- HELPER3 (BUY / SELL when spendUSD === 0) ----------
    if (priceUSD === null && spendUSD === 0) {
      const helper = await resolveBondingPrice(tokenAddr, bnbUSD);

      if (helper && !helper.liquidityAdded) {
        priceUSD = helper.priceUSD;
        marketcapUSD = helper.marketcapUSD;
        priceSource = helper.source; // HELPER3

        finalSpendUSD = priceUSD * tokenAmount * (1 - FOUR_MEME_FEE);
        spendType = "STATE_AFTER_FEE";

        // ESTIMATED BASE (BNB)
        spendAmount = finalSpendUSD / bnbUSD; // USD -> BNB (BENAR)
        spendSymbol = "BNB";
      }
    }

    events.push({
      type: "TRADE",
      side,
      txHash: tx.hash,
      tokenAddress: tokenAddr,
      wallet: side === "BUY" ? to : from,
      isDev: creatorAddr
        ? (side === "BUY" ? to === creatorAddr : from === creatorAddr)
        : false,

      tokenAmount,

      // ===== SPEND =====
      spendAmount,
      spendSymbol,
      spendUSD: finalSpendUSD,
      spendType,

      // ===== PRICE =====
      priceUSD,
      marketcapAtTxUSD: marketcapUSD,
      priceSource,

      time: blockTime
    });
  }

  return events;
}
