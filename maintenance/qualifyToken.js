// maintenance/qualifyToken.js
// FINAL — qualify tokens based on activity & quality (SET-BASED CORE)
// Logs: token_address || tx_count || max_mcap || holders

import { pool } from "../db/postgres.js";
import { getHolderCount } from "../storage/holderStore.pg.js";

const MIN_TX = 50;
const MIN_MCAP = 20_000;
const MIN_HOLDERS = 25;

function now() {
  return Math.floor(Date.now() / 1000);
}

async function markQualified(token) {
  const ts = now();

  await pool.query(
    `
    UPDATE tokens
    SET
      is_qualified = true,
      qualified_at = $1,
      updated_at = $2
    WHERE token_address = $3
    `,
    [ts, ts, token]
  );
}


export async function qualifyTokens() {
  console.log("[QUALIFY] scan started");

  // =========================
  // SET-BASED TRADE STATS
  // =========================
  const { rows: candidates } = await pool.query(
    `
    SELECT
      t.token_address,
      COUNT(tx.*) AS tx_count,
      COALESCE(MAX(tx.marketcap_at_tx_usd), 0) AS max_mcap
    FROM tokens t
    JOIN transactions tx
      ON tx.token_address = t.token_address
     AND tx.type = 'TRADE'
    WHERE t.status IN ('TRADING_ACTIVE','MIGRATED')
      AND (t.is_qualified IS NULL OR t.is_qualified = false)
    GROUP BY t.token_address
    HAVING
      COUNT(tx.*) >= $1
      AND COALESCE(MAX(tx.marketcap_at_tx_usd), 0) >= $2
    `,
    [MIN_TX, MIN_MCAP]
  );

  if (candidates.length === 0) {
    console.log("[QUALIFY] no candidates");
    return;
  }

  console.log(`[QUALIFY] candidates=${candidates.length}`);

  let qualified = 0;

  // =========================
  // HOLDER CHECK (UNAVOIDABLE LOOP)
  // =========================
  for (const c of candidates) {
    const token = c.token_address;
    const txCount = Number(c.tx_count);
    const maxMcap = Number(c.max_mcap);

    const holders = await getHolderCount(token);
    if (holders < MIN_HOLDERS) continue;

    await markQualified(token);
    qualified++;

    console.log(
      `[QUALIFIED] ${token}` +
      ` || tx=${txCount}` +
      ` || mcap=${maxMcap}` +
      ` || holders=${holders}`
    );
  }

  console.log(`[QUALIFY] finished | qualified=${qualified}`);
}
