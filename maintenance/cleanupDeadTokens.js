// maintenance/cleanupDeadTokens.js
// FINAL — cleanup dead / inactive tokens (SET-BASED + DETAILED LOG)
// Logs: token_address || marketcap || last_tx_time

import { pool } from "../db/postgres.js";

const ONE_DAY = 24 * 60 * 60;
const DEAD_MCAP_USD = 5_000;

function now() {
  return Math.floor(Date.now() / 1000);
}

export async function cleanupDeadTokens() {
  console.log("[CLEANUP] dead token scan started");

  const ts = now();
  const since = ts - ONE_DAY;

  // =========================
  // PREVIEW + LOG SOURCE
  // =========================
  const preview = await pool.query(
    `
    SELECT
      t.token_address,
      COALESCE(MAX(tx.marketcap_at_tx_usd), 0) AS last_mcap,
      COALESCE(MAX(tx.time), 0) AS last_tx_time
    FROM tokens t
    LEFT JOIN transactions tx
      ON tx.token_address = t.token_address
     AND tx.type = 'TRADE'
    WHERE t.status NOT IN ('DEAD','RUG','IGNORED')
    GROUP BY t.token_address
    HAVING
      COALESCE(MAX(tx.time), 0) < $1
      AND COALESCE(MAX(tx.marketcap_at_tx_usd), 0) < $2
    `,
    [since, DEAD_MCAP_USD]
  );

  if (preview.rows.length === 0) {
    console.log("[CLEANUP] no dead tokens found");
    return;
  }

  console.log(`[CLEANUP] candidates=${preview.rows.length}`);

  // =========================
  // DETAILED LOGGING
  // =========================
  for (const r of preview.rows) {
    console.log(
      `[DEAD][CANDIDATE] ${r.token_address} || mcap=${Number(r.last_mcap).toFixed(2)} || last_tx=${r.last_tx_time}`
    );
  }

  // =========================
  // SINGLE UPDATE
  // =========================
  const res = await pool.query(
    `
    UPDATE tokens t
    SET
      status = 'DEAD',
      updated_at = $1
    FROM (
      SELECT t2.token_address
      FROM tokens t2
      LEFT JOIN transactions tx
        ON tx.token_address = t2.token_address
       AND tx.type = 'TRADE'
      WHERE t2.status NOT IN ('DEAD','RUG','IGNORED')
      GROUP BY t2.token_address
      HAVING
        COALESCE(MAX(tx.time), 0) < $2
        AND COALESCE(MAX(tx.marketcap_at_tx_usd), 0) < $3
    ) dead
    WHERE t.token_address = dead.token_address
    `,
    [ts, since, DEAD_MCAP_USD]
  );

  console.log(`[CLEANUP] finished | dead=${res.rowCount}`);
}
