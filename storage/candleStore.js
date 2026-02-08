// storage/candleStore.js
// OHLCV + Marketcap candles from transaction events
// Source of truth: transactionStore

import fs from "fs";
import path from "path";

// ================= CONFIG =================
const DATA_DIR = path.resolve("./data/candles");

const TIMEFRAMES = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};

// ================= INIT =================
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ================= HELPERS =================
function getTokenDir(tokenAddress) {
  const dir = path.join(DATA_DIR, tokenAddress.toLowerCase());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getFile(tokenAddress, tf) {
  return path.join(getTokenDir(tokenAddress), `${tf}.json`);
}

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getBucket(time, tfSec) {
  return Math.floor(time / tfSec) * tfSec;
}

// ================= API =================

/**
 * Create genesis candle (called from createToken)
 * Uses the SAME schema as normal candles
 */
export function createGenesisCandle(tokenAddress, genesisCandle) {
  if (!tokenAddress || !genesisCandle) return;

  for (const [tf, sec] of Object.entries(TIMEFRAMES)) {
    const file = getFile(tokenAddress, tf);
    const candles = readJSON(file);

    if (candles.length > 0) continue;

    const t = getBucket(genesisCandle.time, sec);

    candles.push({
      time: t,

      open: genesisCandle.open,
      high: genesisCandle.high,
      low: genesisCandle.low,
      close: genesisCandle.close,

      marketcapUSD: genesisCandle.marketcapUSD,

      volumeUSD: genesisCandle.volumeUSD,
      buyVolumeUSD: genesisCandle.buyVolumeUSD,
      sellVolumeUSD: genesisCandle.sellVolumeUSD,

      txCount: genesisCandle.txCount
    });

    writeJSON(file, candles);
  }
}

/**
 * Update candles from transaction events
 */
export function updateCandles(tokenAddress, events = []) {
  if (!tokenAddress || !Array.isArray(events) || events.length === 0) return;

  for (const [tf, sec] of Object.entries(TIMEFRAMES)) {
    const file = getFile(tokenAddress, tf);
    const candles = readJSON(file);

    for (const e of events) {
      if (!e || !e.time || !e.priceUSD || !e.side) continue;

      const bucket = getBucket(e.time, sec);
      let candle = candles.find(c => c.time === bucket);

      if (!candle) {
        const lastClose =
          candles.length > 0
            ? candles[candles.length - 1].close
            : e.priceUSD;

        candle = {
          time: bucket,

          open: lastClose,
          high: e.priceUSD,
          low: e.priceUSD,
          close: e.priceUSD,

          marketcapUSD: e.marketcapAtTxUSD ?? null,

          volumeUSD: 0,
          buyVolumeUSD: 0,
          sellVolumeUSD: 0,

          txCount: 0
        };

        candles.push(candle);
      }

      // ===== PRICE =====
      candle.high = Math.max(candle.high, e.priceUSD);
      candle.low = Math.min(candle.low, e.priceUSD);
      candle.close = e.priceUSD;

      // ===== MARKETCAP SNAPSHOT =====
      if (e.marketcapAtTxUSD !== undefined) {
        candle.marketcapUSD = e.marketcapAtTxUSD;
      }

      // ===== VOLUME =====
      const v = Number(e.spendUSD ?? 0);
      candle.volumeUSD += v;

      if (e.side === "BUY") {
        candle.buyVolumeUSD += v;
      } else if (e.side === "SELL") {
        candle.sellVolumeUSD += v;
      }

      candle.txCount += 1;
    }

    candles.sort((a, b) => a.time - b.time);
    writeJSON(file, candles);
  }
}
