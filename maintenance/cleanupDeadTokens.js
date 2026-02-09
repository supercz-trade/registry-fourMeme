// maintenance/cleanupDeadTokens.js
// FINAL — cleanup dead / inactive tokens
// Criteria:
// - no trade in last 24h
// - last known mcap < threshold

import { pool } from "../db/postgres.js";

const ONE_DAY = 24 * 60 * 60;
const DEAD_MCAP_USD = 5_000;

function now() {
  return Math.floor(Date.now() / 1000);
}

async function countRecentTrades(token) {
  const since = now() - ONE_DAY;

  const { rows } = await pool.query(
    `
    SELECT COUNT(*) AS cnt
    FROM transactions
    WHERE token_address = $1
      AND type = 'TRADE'
      AND time >= $2
    `,
    [token, since]
  );

  return Number(rows[0]?.cnt || 0);
}

async function getLastMarketcap(token) {
  const { rows } = await pool.query(
    `
    SELECT marketcap_at_tx_usd
    FROM transactions
    WHERE token_address = $1
      AND marketcap_at_tx_usd IS NOT NULL
    ORDER BY time DESC
    LIMIT 1
    `,
    [token]
  );

  return rows.length ? Number(rows[0].marketcap_at_tx_usd) : 0;
}

async function markDead(token) {
  const ts = now();
  await pool.query(
    `
    UPDATE tokens
    SET status = 'DEAD',
        updated_at = $1
    WHERE token_address = $2
    `,
    [ts, token]
  );
}

export async function cleanupDeadTokens() {
  console.log("[CLEANUP] dead token scan started");

  const { rows: tokens } = await pool.query(
    `
    SELECT token_address
    FROM tokens
    WHERE status NOT IN ('DEAD','RUG','IGNORED')
    `
  );

  let dead = 0;

  for (const t of tokens) {
    const token = t.token_address;

    const trades24h = await countRecentTrades(token);
    if (trades24h > 0) continue;

    const mcap = await getLastMarketcap(token);
    if (mcap >= DEAD_MCAP_USD) continue;

    await markDead(token);
    dead++;

    console.log(`[DEAD] ${token} | mcap=${mcap}`);
  }

  console.log(`[CLEANUP] finished | dead=${dead}`);
}
