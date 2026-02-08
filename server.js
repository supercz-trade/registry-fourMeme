// server.js
// SuperCZ API Server (READ-ONLY, POSTGRES, FINAL FIXED)

import "dotenv/config";

import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ================= DATABASE =================
// ================= DATABASE =================
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,

  // ===== REQUIRED FOR NEON / CLOUD POSTGRES =====
  ssl: process.env.PG_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
});



// ================= TIMEFRAMES =================
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

// ================= ROUTES =================

/**
 * GET /api/tokens
 */
app.get("/api/tokens", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT token_address FROM tokens ORDER BY created_at DESC`
  );
  res.json(rows.map(r => r.token_address));
});

/**
 * GET /api/token/:token
 * Registry info
 */
app.get("/api/token/:token", async (req, res) => {
  const token = req.params.token.toLowerCase();

  const { rows } = await pool.query(
    `SELECT * FROM tokens WHERE token_address=$1`,
    [token]
  );

  if (!rows.length) {
    return res.status(404).json({ error: "Token not found" });
  }

  const r = rows[0];

  res.json({
    tokenAddress: r.token_address,
    name: r.name,
    symbol: r.symbol,
    creator: r.creator,

    launchTxHash: r.launch_tx_hash,
    launchTime: r.launch_time,
    launchSource: r.launch_source,

    registryMode: "ONCHAIN",
    registryFrom: "internal",

    baseToken: r.base_token,
    baseTokenAddress: r.base_token_address,
    baseTokenType: r.base_token_type,

    metadata: {
      telegram: r.telegram,
      twitter: r.twitter,
      website: r.website,
      image: r.image
    },

    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  });
});

/**
 * GET /api/token/:token/transactions
 * ?limit=50
 */
app.get("/api/token/:token/transactions", async (req, res) => {
  const token = req.params.token.toLowerCase();
  const limit = Number(req.query.limit || 50);

  const { rows } = await pool.query(
    `
    SELECT *
    FROM transactions
    WHERE token_address=$1
    ORDER BY time DESC
    LIMIT $2
    `,
    [token, limit]
  );

  res.json(rows);
});

/**
 * GET /api/token/:token/holders
 */
app.get("/api/token/:token/holders", async (req, res) => {
  const token = req.params.token.toLowerCase();

  const { rows } = await pool.query(
    `
    SELECT
      wallet,
      SUM(
        CASE
          WHEN side='BUY'  THEN token_amount
          WHEN side='SELL' THEN -token_amount
          ELSE 0
        END
      ) AS balance
    FROM transactions
    WHERE token_address=$1
    GROUP BY wallet
    HAVING SUM(
      CASE
        WHEN side='BUY'  THEN token_amount
        WHEN side='SELL' THEN -token_amount
        ELSE 0
      END
    ) > 0
    ORDER BY balance DESC
    `,
    [token]
  );

  res.json({
    count: rows.length,
    holders: rows
  });
});

/**
 * GET /api/token/:token/candles/:tf
 * ?limit=300
 */
app.get("/api/token/:token/candles/:tf", async (req, res) => {
  const token = req.params.token.toLowerCase();
  const tf = req.params.tf;
  const limit = Number(req.query.limit || 300);

  const sec = TIMEFRAMES[tf];
  if (!sec) {
    return res.status(400).json({ error: "Invalid timeframe" });
  }

  const { rows } = await pool.query(
    `
    SELECT
      FLOOR(time / $2) * $2 AS time,

      MIN(price_usd) AS low,
      MAX(price_usd) AS high,

      (ARRAY_AGG(price_usd ORDER BY time ASC))[1]  AS open,
      (ARRAY_AGG(price_usd ORDER BY time DESC))[1] AS close,

      SUM(spend_usd) AS volumeUSD,
      SUM(CASE WHEN side='BUY'  THEN spend_usd ELSE 0 END) AS buyVolumeUSD,
      SUM(CASE WHEN side='SELL' THEN spend_usd ELSE 0 END) AS sellVolumeUSD,

      COUNT(*) AS txCount
    FROM transactions
    WHERE token_address=$1
      AND price_usd IS NOT NULL
    GROUP BY FLOOR(time / $2)
    ORDER BY time DESC
    LIMIT $3
    `,
    [token, sec, limit]
  );

  res.json(rows.reverse());
});

/**
 * GET /api/token/:token/summary
 * FIXED: createdAt normalized to seconds
 */
app.get("/api/token/:token/summary", async (req, res) => {
  const token = req.params.token.toLowerCase();

  const infoRes = await pool.query(
    `SELECT * FROM tokens WHERE token_address=$1`,
    [token]
  );

  if (!infoRes.rows.length) {
    return res.status(404).json({ error: "Token not found" });
  }

  const info = infoRes.rows[0];

  const lastTxRes = await pool.query(
    `
    SELECT price_usd, marketcap_at_tx_usd
    FROM transactions
    WHERE token_address=$1
    ORDER BY time DESC
    LIMIT 1
    `,
    [token]
  );

  const holderCountRes = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM (
      SELECT wallet
      FROM transactions
      WHERE token_address=$1
      GROUP BY wallet
      HAVING SUM(
        CASE
          WHEN side='BUY'  THEN token_amount
          WHEN side='SELL' THEN -token_amount
          ELSE 0
        END
      ) > 0
    ) t
    `,
    [token]
  );

  const txCountRes = await pool.query(
    `SELECT COUNT(*) FROM transactions WHERE token_address=$1`,
    [token]
  );

  // ===== TIME NORMALIZATION (CRITICAL FIX) =====
  const createdAtRaw = info.created_at;
  const createdAt =
    createdAtRaw > 1e12
      ? Math.floor(createdAtRaw / 1000)
      : createdAtRaw;

  res.json({
    token, // IMPORTANT: frontend expects `token`

    name: info.name,
    symbol: info.symbol,
    creator: info.creator,

    launchTime: info.launch_time,
    createdAt,

    priceUSD: lastTxRes.rows[0]?.price_usd ?? null,
    marketcapUSD: lastTxRes.rows[0]?.marketcap_at_tx_usd ?? null,

    txCount: Number(txCountRes.rows[0].count),
    holderCount: Number(holderCountRes.rows[0].count),

    metadata: {
      telegram: info.telegram,
      twitter: info.twitter,
      website: info.website,
      image: info.image
    }
  });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`[API] SuperCZ server running on port ${PORT}`);
});
