// monitor/createToken.js
// four.meme mode — GENESIS PRODUCER
// Outputs: registry, genesisTx, genesisHolder, genesisCandle
// [MODIFIED] call four.meme API to enrich tax, liquidity, metadata

import { ethers } from "ethers";
import { getPairPriceUSD } from "../price/pairPriceCache.js";
import { fetchTokenMeta } from "../services/fetchTokenMeta_api.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOTAL_SUPPLY = 1_000_000_000;
const TOKEN_DECIMALS = 18;

const TOKEN_META_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

const PAIR_WHITELIST = {
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": { symbol: "USD1", decimals: 18, stable: true },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, stable: true },
  "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2": { symbol: "USDC", decimals: 18, stable: true },
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": { symbol: "CAKE", decimals: 18, stable: false },
  "0x000ae314e2a2172a039b26378814c252734f556a": { symbol: "ASTER", decimals: 18, stable: false }
};

function normalizeBNB(raw) {
  if (raw < 0.011) return raw * 0.0001;
  return raw * 0.9876;
}

function addrFromTopic(topic) {
  return "0x" + topic.slice(26);
}

export async function handleCreateToken({
  tx,
  receipt,
  block,
  manager,
  bnbUSD,
  provider
}) {
  const creator = tx.from.toLowerCase();
  const managerAddr = manager.toLowerCase();

  let tokenAddress = null;
  let tokenReceived = 0;

  // ================= TOKEN DISTRIBUTION =================
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const from = addrFromTopic(log.topics[1]).toLowerCase();
    const to   = addrFromTopic(log.topics[2]).toLowerCase();

    if (from === managerAddr && to === creator) {
      tokenAddress = log.address.toLowerCase();
      tokenReceived += Number(
        ethers.formatUnits(BigInt(log.data), TOKEN_DECIMALS)
      );
    }
  }

  if (!tokenAddress || tokenReceived === 0) return null;

  // ================= BASIC TOKEN META (ONCHAIN) =================
  let name = null;
  let symbol = null;

  try {
    const token = new ethers.Contract(tokenAddress, TOKEN_META_ABI, provider);
    [name, symbol] = await Promise.all([token.name(), token.symbol()]);
  } catch {}

  // ================= API ENRICH =================
  let apiMeta = null;
  try {
    apiMeta = await fetchTokenMeta(tokenAddress);
  } catch {}

  // ================= PAIR SPEND =================
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

    if (to === managerAddr && addr !== tokenAddress && PAIR_WHITELIST[addr]) {
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
    if (!px) return null;

    spendUSD = pairSpend.amount * px;
    baseTokenPriceUSD = px;
  }

  if (spendUSD <= 0) return null;

  const priceUSD = spendUSD / tokenReceived;
  const marketcapUSD = priceUSD * TOTAL_SUPPLY;
  const candleTime = Math.floor(block.timestamp / 60) * 60;

  // ================= FINAL OUTPUT =================
  return {
    registry: {
      tokenAddress,
      name: apiMeta?.name ?? name,
      symbol: apiMeta?.symbol ?? symbol,
      creator,

      TOTAL_SUPPLY,

      launchTxHash: tx.hash,
      launchTime: block.timestamp,
      launchSource: "four_meme",
      sourcePlatform: "internal_onchain",

      baseToken: pairSpend.symbol,
      baseTokenAddress: pairSpend.address,
      baseTokenType: pairSpend.stable ? "stable" : "volatile",

      metadata: apiMeta?.metadata ?? {
        telegram: null,
        twitter: null,
        website: null,
        image: "default"
      },

      description: apiMeta?.description ?? null,
      tax: apiMeta?.tax ?? 0,
      liquidityType: apiMeta?.liquidityType ?? "BURNT",
      contractVerified: true,
      redFlag: null,
      minBuy: null,
      maxBuy: null,

      status: "TRADING_ACTIVE",
      createdAt: block.timestamp
    },

    genesisTx: {
      type: "DEV_BUY",
      side: "BUY",

      txHash: tx.hash,
      tokenAddress,
      wallet: creator,

      tokenAmount: tokenReceived,

      spendAmount: pairSpend.amount,
      spendSymbol: pairSpend.symbol,
      spendUSD,

      baseTokenPriceUSD,

      priceUSD,
      marketcapAtTxUSD: marketcapUSD,

      time: candleTime
    },

    genesisHolder: {
      tokenAddress,
      address: creator,
      balance: tokenReceived,

      isCreator: true,
      firstSeenAt: block.timestamp,
      source: "genesis"
    },

    genesisCandle: {
      tokenAddress,
      timeframe: "1m",
      time: candleTime,

      open: priceUSD,
      high: priceUSD,
      low: priceUSD,
      close: priceUSD,

      marketcapUSD,

      volumeUSD: spendUSD,
      buyVolumeUSD: spendUSD,
      sellVolumeUSD: 0,

      txCount: 1
    }
  };
}
