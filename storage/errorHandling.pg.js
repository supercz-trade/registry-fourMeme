// storage/errorHandling.pg.js
// FINAL — SuperCZ Error Registry (Postgres)
// Lifecycle-aware, engine-safe
// [MODIFIED] enriched context logging

import { pool } from "../db/postgres.js";

function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Save error log
 */
export async function saveErrorLog(error) {
  if (!error || !error.txHash || !error.errorType) return;

  await pool.query(
    `
    INSERT INTO error_logs (
      tx_hash,
      block_number,      -- [NEW]
      token_address,
      wallet,
      sender,            -- [NEW]
      to_address,        -- [NEW]
      bnb_value,         -- [NEW]
      raw_method,        -- [NEW]
      module_stage,      -- [NEW]
      error_type,
      error_message,
      debug_data,
      created_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
    `,
    [
      error.txHash,

      // [NEW]
      error.blockNumber ?? null,

      // [MODIFIED] avoid null token
      error.tokenAddress?.toLowerCase() ?? "UNKNOWN",

      error.wallet?.toLowerCase() ?? null,

      // [NEW]
      error.sender?.toLowerCase() ?? null,
      error.toAddress?.toLowerCase() ?? null,
      error.bnbValue ?? 0,
      error.rawMethod ?? null,
      error.moduleStage ?? null,

      error.errorType,
      error.errorMessage ?? null,

      // [MODIFIED] always structured
      error.debugData ? JSON.stringify(error.debugData) : null
    ]
  );
}

/**
 * Shortcut: Save skip event
 */
export async function saveSkip(txHash, reason, extra = {}) {
  if (!txHash) return;

  await saveErrorLog({
    txHash,
    errorType: "SKIPPED",
    errorMessage: reason,
    moduleStage: extra.moduleStage ?? "unknown", // [NEW]
    ...extra
  });
}

/**
 * Shortcut: Save null result
 */
export async function saveNull(txHash, stage, extra = {}) {
  if (!txHash) return;

  await saveErrorLog({
    txHash,
    errorType: "NULL_RESULT",
    errorMessage: `Null result at ${stage}`,
    moduleStage: stage, // [NEW]
    ...extra
  });
}

/**
 * Save internal exception
 */
export async function saveException(txHash, error, context = {}) {
  if (!txHash || !error) return;

  await saveErrorLog({
    txHash,
    errorType: "EXCEPTION",
    errorMessage: error.message,
    moduleStage: context.moduleStage ?? "exception", // [NEW]
    debugData: {
      stack: error.stack,
      ...context
    },
    ...context
  });
}

/**
 * Get errors by tx hash
 */
export async function getErrorsByTx(txHash) {
  if (!txHash) return [];

  const { rows } = await pool.query(
    `
    SELECT *
    FROM error_logs
    WHERE tx_hash=$1
    ORDER BY created_at ASC
    `,
    [txHash]
  );

  return rows;
}

/**
 * Get recent errors
 */
export async function getRecentErrors(limit = 50) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return rows;
}

/**
 * Count errors for monitoring
 */
export async function countErrorsSince(timestamp) {
  if (!timestamp) return 0;

  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int as total
    FROM error_logs
    WHERE created_at >= $1
    `,
    [timestamp]
  );

  return rows[0]?.total ?? 0;
}
