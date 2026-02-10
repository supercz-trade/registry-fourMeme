// monitoring/detectAddLiquidity.js
// [MODIFIED]
// ADD LIQUIDITY — four.meme Token Manager
// MethodID: 0xe3412e3d
// Emits TRADE-like event (SELL) + isMigration flag
// Fully compatible with transaction / holder / candle pipeline

import { ethers } from "ethers";
import { getPairPriceUSD } from "../price/pairPriceCache.js";

const ADD_LIQUIDITY_SELECTOR = "0xe3412e3d";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOKEN_DECIMALS = 18;
const TOTAL_SUPPLY = 1_000_000_000;

// SAME whitelist philosophy as detectBuySell
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

function normalizeBNB(raw) {
  if (raw < 0.011) return raw * 0.99;
  return raw * 0.99;
}

export function detectAddLiquidity({
  tx,
  receipt,
  tokenAddress,
  manager,
  creator,
  blockTime,
  bnbUSD
}) {
  const events = [];
  if (!tx || !receipt || !tokenAddress) return events;

  // ===== STRICT SELECTOR CHECK =====
  if (!tx.data?.startsWith(ADD_LIQUIDITY_SELECTOR)) return events;
  if (tx.to?.toLowerCase() !== manager.toLowerCase()) return events;

  const tokenAddr = tokenAddress.toLowerCase();
  const managerAddr = manager.toLowerCase();
  const creatorAddr = creator?.toLowerCase() ?? null;

  // ================= PAIR SPEND DETECTION =================
  let pairSpend = {
    symbol: "BNB",
    address: null,
    amount: 0,
    stable: false
  };

  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const to = addrFromTopic(log.topics[2]).toLowerCase();
    const addr = log.address.toLowerCase();

    if (to === managerAddr && PAIR_WHITELIST[addr]) {
      const meta = PAIR_WHITELIST[addr];
      pairSpend = {
        symbol: meta.symbol,
        address: addr,
        amount: Number(
          ethers.formatUnits(BigInt(log.data), meta.decimals)
        ),
        stable: meta.stable
      };
    }
  }

  // ================= SPEND USD =================
  let spendUSD = 0;
  let baseTokenPriceUSD = null;

  if (!pairSpend.address) {
    const rawBNB = Number(ethers.formatEther(tx.value));
    const bnbAmount = normalizeBNB(rawBNB);

    pairSpend.amount = bnbAmount;
    spendUSD = bnbAmount * bnbUSD;
    baseTokenPriceUSD = bnbUSD;

  } else if (pairSpend.stable) {
    spendUSD = pairSpend.amount;
    baseTokenPriceUSD = 1;

  } else {
    const px = getPairPriceUSD(pairSpend.symbol);
    if (!px) return events;

    spendUSD = pairSpend.amount * px;
    baseTokenPriceUSD = px;
  }

  if (spendUSD <= 0) return events;

  // ================= TOKEN FLOW =================
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.address.toLowerCase() !== tokenAddr) continue;

    const from = addrFromTopic(log.topics[1]).toLowerCase();
    const to = addrFromTopic(log.topics[2]).toLowerCase();

    // liquidity = manager -> pair
    if (from !== managerAddr) continue;

    const tokenAmount = Number(
      ethers.formatUnits(BigInt(log.data), TOKEN_DECIMALS)
    );

    if (tokenAmount <= 0) continue;

    const priceUSD = spendUSD / tokenAmount;
    const marketcapUSD = priceUSD * TOTAL_SUPPLY;

    events.push({
      type: "TRADE",
      side: "ADD LIQUIDITY",

      txHash: tx.hash,
      tokenAddress: tokenAddr,
      wallet: from,
      isDev: creatorAddr ? from === creatorAddr : false,

      tokenAmount,

      spendAmount: pairSpend.amount,
      spendSymbol: pairSpend.symbol,
      spendUSD,

      baseTokenPriceUSD,

      priceUSD,
      marketcapAtTxUSD: marketcapUSD,

      // ===== ADDITIONAL FLAGS =====
      isMigration: true,
      liquidityEvent: true,

      // [NEW] lifecycle fields
      migratedAt: blockTime,        // epoch sec, chain-derived
      sourcePlatform: "MIGRATION",    // lifecycle event

      pairAddress: to,

      time: blockTime
    });
  }

  return events;
}
