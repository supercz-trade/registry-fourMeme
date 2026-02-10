// server.js
// SuperCZ API Server (READ-ONLY, POSTGRES, FIXED)

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
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
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
 * ?limit=50
 */
app.get("/api/tokens", async (req, res) => {
  // [NEW]
  const limit = Math.min(
    Number(req.query.limit || 50),
    200
  );

  try {
    const { rows } = await pool.query(
      `
      SELECT token_address
      FROM tokens
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    res.json(rows.map(r => r.token_address));
  } catch {
    res.status(500).json({ error: "DB_ERROR" });
  }
});

/**
 * GET /api/token/:token/summary
 */
app.get("/api/token/:token/summary", async (req, res) => {
  const token = req.params.token.toLowerCase();
  const mode = req.query.mode || "full";

  try {
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
        AND price_usd IS NOT NULL
      ORDER BY time DESC
      LIMIT 1
      `,
      [token]
    );

    const createdAtRaw = info.created_at;
    const createdAt =
      createdAtRaw > 1e12
        ? Math.floor(createdAtRaw / 1000)
        : createdAtRaw;

    // === LITE MODE ===
    if (mode === "lite") {
      return res.json({
        token,
        name: info.name,
        symbol: info.symbol,

        launchTime: info.launch_time,
        createdAt,

        priceUSD: lastTxRes.rows[0]?.price_usd ?? null,
        marketcapUSD: lastTxRes.rows[0]?.marketcap_at_tx_usd ?? null,

        metadata: {
          image: info.image
        }
      });
    }

    // === FULL MODE ===
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

    res.json({
      token,

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
  } catch {
    res.status(500).json({ error: "DB_ERROR" });
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`[API] SuperCZ server running on port ${PORT}`);
});
