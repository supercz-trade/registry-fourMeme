// maintenance/qualifyToken.js
// FINAL — qualify tokens based on activity & quality

import { pool } from "../db/postgres.js";
import { getHolderCount } from "../storage/holderStore.pg.js";

const MIN_TX = 50;
const MIN_MCAP = 20_000;
const MIN_HOLDERS = 25;

function now() {
  return Math.floor(Date.now() / 1000);
}

async function getTradeStats(token) {
  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*) AS tx_count,
      MAX(marketcap_at_tx_usd) AS max_mcap
    FROM transactions
    WHERE token_address = $1
      AND type = 'TRADE'
    `,
    [token]
  );

  return {
    txCount: Number(rows[0]?.tx_count || 0),
    maxMarketcap: Number(rows[0]?.max_mcap || 0)
  };
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

  const { rows: tokens } = await pool.query(
    `
    SELECT token_address
    FROM tokens
    WHERE status IN ('TRADING_ACTIVE','MIGRATED')
      AND (is_qualified IS NULL OR is_qualified = false)
    `
  );

  let qualified = 0;

  for (const t of tokens) {
    const token = t.token_address;

    const { txCount, maxMarketcap } = await getTradeStats(token);
    if (txCount < MIN_TX) continue;
    if (maxMarketcap < MIN_MCAP) continue;

    const holders = await getHolderCount(token);
    if (holders < MIN_HOLDERS) continue;

    await markQualified(token);
    qualified++;

    console.log(
      `[QUALIFIED] ${token} | tx=${txCount} | mcap=${maxMarketcap} | holders=${holders}`
    );
  }

  console.log(`[QUALIFY] finished | qualified=${qualified}`);
}
