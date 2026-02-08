// price/pairPriceCache.js
// CoinGecko price cache (rate-limit safe, periodic)

import fetch from "node-fetch";

// ================= CONFIG =================
// CoinGecko IDs (isi sesuai pair whitelist kamu)
const COINGECKO_IDS = {
  CAKE: "pancakeswap-token",
  ASTER: "aster",          // pastikan ID benar
  U: "u-token"             // contoh, sesuaikan
};

// update interval (seconds)
const UPDATE_INTERVAL = 90;

// ================= STATE =================
const PRICE_CACHE = new Map(); // symbol -> { usd, updatedAt }
let lastUpdate = 0;

// ================= CORE =================
async function fetchPrices() {
  const symbols = Object.keys(COINGECKO_IDS);
  if (symbols.length === 0) return;

  const ids = symbols.map(s => COINGECKO_IDS[s]).join(",");
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${ids}&vs_currencies=usd`;

  try {
    const res = await fetch(url, { timeout: 10_000 });
    if (!res.ok) return;

    const json = await res.json();
    const now = Math.floor(Date.now() / 1000);

    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      const price = json?.[id]?.usd;
      if (typeof price === "number") {
        PRICE_CACHE.set(symbol, { usd: price, updatedAt: now });
      }
    }

    lastUpdate = now;
  } catch {
    // silent fail, keep last cache
  }
}

// ================= PUBLIC API =================
export function startPairPriceCache() {
  // initial fetch
  fetchPrices();
  setInterval(fetchPrices, UPDATE_INTERVAL * 1000);
}

export function getPairPriceUSD(symbol) {
  const entry = PRICE_CACHE.get(symbol);
  return entry ? entry.usd : null;
}

export function getPairPriceMeta(symbol) {
  return PRICE_CACHE.get(symbol) || null;
}
