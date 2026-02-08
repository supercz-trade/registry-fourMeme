// db/postgres.js
// [FIXED] Neon / Cloud / VPS ready

import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,

  // ===== REQUIRED FOR NEON =====
  ssl: process.env.PG_SSL === "true"
    ? { rejectUnauthorized: false }
    : false,

  // ===== SAFE DEFAULTS =====
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
