// services/fetchTokenMeta_api.js
// FINAL — four.meme API → SuperCZ registry (IMPORTED)

import fetch from "node-fetch";

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
      accept: "application/json"
    }
  });

  if (!res.ok) return null;

  const json = await res.json();

  if (!json || json.code !== 0 || !json.data) return null;

  const d = json.data;

  // four.meme BSC assumptions (safe)
  const baseToken = "BNB";
  const baseTokenAddress = null;
  const baseTokenType = "volatile";

  return {
    tokenAddress: d.address.toLowerCase(),
    name: d.name ?? null,
    symbol: d.shortName ?? null,
    creator: d.userAddress?.toLowerCase() ?? null,

    launchTxHash: null, // API does not expose tx hash
    launchTime: Math.floor(Number(d.launchTime) / 1000), // ms → sec

    launchSource: "four_meme",
    registryMode: "IMPORTED",
    registryFrom: "four_meme_api",

    baseToken,
    baseTokenAddress,
    baseTokenType,

    metadata: {
      telegram: d.telegramUrl || null,
      twitter: d.twitterUrl || null,
      website: d.webUrl || null,
      image: d.image || "default"
    },

    status: "TRADING_ACTIVE",
    createdAt: d.createDate
      ? Math.floor(Number(d.createDate) / 1000)
      : Math.floor(Number(d.launchTime) / 1000)
  };
}
