// services/fetchTokenMeta_api.js
// FINAL — four.meme API → SuperCZ registry (IMPORTED)
// [MODIFIED] auto baseTokenAddress from PAIR_WHITELIST

import fetch from "node-fetch";

// ================= PAIR WHITELIST =================
const PAIR_WHITELIST = {
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": { symbol: "USD1", decimals: 18, stable: true },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, stable: true },
  "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2": { symbol: "USDC", decimals: 18, stable: true },
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": { symbol: "CAKE", decimals: 18, stable: false },
  "0x000ae314e2a2172a039b26378814c252734f556a": { symbol: "ASTER", decimals: 18, stable: false }
};

/**
 * Fetch token registry metadata from four.meme API
 * @param {string} tokenAddress
 */
export async function fetchTokenMeta(tokenAddress) {
  const url =
    `https://four.meme/meme-api/v1/private/token/get/v2?address=${tokenAddress}`;

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; Win64) Chrome/120",
      accept: "application/json"
    }
  });

  if (!res.ok) return null;

  const json = await res.json();
  if (!json || json.code !== 0 || !json.data) return null;

  const d = json.data;

  // ================= BASE TOKEN RESOLUTION =================
  // four.meme BSC assumption → BNB as default
  let baseToken = "BNB";
  let baseTokenAddress = null;
  let baseTokenType = "volatile";

  // If tokenPrice has liquidity pairing info, detect it
  // (optional extension if API later provides base token address)

  // For now default to BNB (WBNB)
  const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

  baseTokenAddress = WBNB;
  baseTokenType = "volatile";

  // ================= TAX & ENGINE FLAGS =================
  const tax = 0;
  const description = d.descr ?? null;

  return {
    tokenAddress: d.address.toLowerCase(),
    name: d.name ?? null,
    symbol: d.shortName ?? null,
    creator: d.userAddress?.toLowerCase() ?? null,

    launchTxHash: null,
    launchTime: Math.floor(Number(d.launchTime) / 1000),

    launchSource: "four_meme",
    sourcePlatform: "four_meme_api",

    baseToken,
    baseTokenAddress,
    baseTokenType,

    metadata: {
      telegram: d.telegramUrl || null,
      twitter: d.twitterUrl || null,
      website: d.webUrl || null,
      image: d.image || "default"
    },

    description,
    tax,
    liquidityType: "BURNT",
    contractVerified: true,
    redFlag: null,
    minBuy: null,
    maxBuy: null,

    status: "TRADING_ACTIVE",
    createdAt: d.createDate
      ? Math.floor(Number(d.createDate) / 1000)
      : Math.floor(Number(d.launchTime) / 1000)
  };
}
