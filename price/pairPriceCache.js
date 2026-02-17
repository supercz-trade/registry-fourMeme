// price/pairPriceCache.js
// Binance-only price cache (rate-limit safe, periodic)

import fetch from "node-fetch";

// ================= CONFIG =================

// Binance symbol mapping (pastikan sesuai pair USDT)
const BINANCE_SYMBOLS = {
  CAKE: "CAKEUSDT",
  ASTER: "ASTERUSDT",
};

// update interval (seconds)
const UPDATE_INTERVAL = 90;

// ================= STATE =================
const PRICE_CACHE = new Map(); // symbol -> { usd, updatedAt, source }
let lastUpdate = 0;

// ================= CORE =================

// [RENAMED] fetchFromBinance → fetchPriceFromBinance
async function fetchPriceFromBinance(symbol) {
  const pair = BINANCE_SYMBOLS[symbol];
  if (!pair) return null;

  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`;

  try {
    const res = await fetch(url, { timeout: 10_000 });
    if (!res.ok) return null;
    const json = await res.json();
    const price = parseFloat(json?.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

// [RENAMED] fetchPrices → updateAllPrices
async function updateAllPrices() {
  const symbols = Object.keys(BINANCE_SYMBOLS);
  if (symbols.length === 0) return;

  const now = Math.floor(Date.now() / 1000);

  for (const symbol of symbols) {
    const price = await fetchPriceFromBinance(symbol);

    if (price !== null) {
      PRICE_CACHE.set(symbol, {
        usd: price,
        updatedAt: now,
        source: "BINANCE"
      });
    }
  }

  lastUpdate = now;
}

// ================= PUBLIC API =================

export function startPairPriceCache() {
  updateAllPrices();
  setInterval(updateAllPrices, UPDATE_INTERVAL * 1000);
}

export function getPairPriceUSD(symbol) {
  const entry = PRICE_CACHE.get(symbol);
  return entry ? entry.usd : null;
}

export function getPairPriceMeta(symbol) {
  return PRICE_CACHE.get(symbol) || null;
}
