// utils/logError.js
// SuperCZ structured error logger

import pkg from "pg";
import "dotenv/config";

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  ssl: process.env.PG_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
});

// [NEW] structured error logger
export async function logError({
  txHash,
  blockNumber,
  tokenAddress,
  sender,
  toAddress,
  bnbValue,
  errorType,
  errorMessage,
  moduleStage,
  rawMethod
}) {
  try {
    await pool.query(
      `
      INSERT INTO error_logs (
        tx_hash,
        block_number,
        token_address,
        sender,
        to_address,
        bnb_value,
        error_type,
        error_message,
        module_stage,
        raw_method,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      `,
      [
        txHash || null,
        blockNumber || null,
        tokenAddress || "UNKNOWN", // [MODIFIED] no null
        sender || null,
        toAddress || null,
        bnbValue || 0,
        errorType,
        errorMessage,
        moduleStage || null,
        rawMethod || null
      ]
    );
  } catch (err) {
    console.error("FAILED TO LOG ERROR:", err.message);
  }
}
