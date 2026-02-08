// storage/candleStore.pg.js
// [MODIFIED] PostgreSQL candle store with sub-minute support

import { pool } from "../db/postgres.js";

const TIMEFRAMES = {
  "1s": 1,
  "15s": 15,
  "30s": 30,

  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};

/**
 * Base candles from transactions (1s resolution)
 */
async function getBaseCandles1s(tokenAddress) {
  const { rows } = await pool.query(
    `
    SELECT
      FLOOR(time / 1) * 1 AS time,

      MIN(price_usd) AS low,
      MAX(price_usd) AS high,

      (ARRAY_AGG(price_usd ORDER BY time ASC))[1] AS open,
      (ARRAY_AGG(price_usd ORDER BY time DESC))[1] AS close,

      SUM(spend_usd) AS volumeUSD,
      SUM(CASE WHEN side='BUY' THEN spend_usd ELSE 0 END) AS buyVolumeUSD,
      SUM(CASE WHEN side='SELL' THEN spend_usd ELSE 0 END) AS sellVolumeUSD,

      COUNT(*) AS txCount,
      MAX(marketcap_at_tx_usd) AS marketcapUSD
    FROM transactions
    WHERE token_address=$1
      AND price_usd IS NOT NULL
    GROUP BY FLOOR(time / 1)
    ORDER BY time ASC
    `,
    [tokenAddress.toLowerCase()]
  );

  return rows;
}

/**
 * Aggregate candles from lower resolution
 */
function aggregateCandles(source, tfSec) {
  const map = new Map();

  for (const c of source) {
    const bucket = Math.floor(c.time / tfSec) * tfSec;

    if (!map.has(bucket)) {
      map.set(bucket, {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volumeUSD: 0,
        buyVolumeUSD: 0,
        sellVolumeUSD: 0,
        txCount: 0,
        marketcapUSD: c.marketcapUSD
      });
    }

    const o = map.get(bucket);

    o.high = Math.max(o.high, c.high);
    o.low = Math.min(o.low, c.low);
    o.close = c.close;

    o.volumeUSD += Number(c.volumeUSD ?? 0);
    o.buyVolumeUSD += Number(c.buyVolumeUSD ?? 0);
    o.sellVolumeUSD += Number(c.sellVolumeUSD ?? 0);
    o.txCount += Number(c.txCount ?? 0);

    if (c.marketcapUSD !== null) {
      o.marketcapUSD = c.marketcapUSD;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/**
 * PUBLIC API
 */
export async function getCandles(tokenAddress, timeframe = "1m") {
  if (!TIMEFRAMES[timeframe]) return [];

  const base = await getBaseCandles1s(tokenAddress);

  if (timeframe === "1s") return base;

  return aggregateCandles(base, TIMEFRAMES[timeframe]);
}
