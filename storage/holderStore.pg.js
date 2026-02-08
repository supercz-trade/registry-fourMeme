// storage/holderStore.pg.js
// [NEW] Derived from transactions (NO FILE)

import { pool } from "../db/postgres.js";

/**
 * Get holders snapshot
 */
export async function getAllHolders(tokenAddress) {
  const { rows } = await pool.query(
    `
    SELECT
      wallet,
      SUM(
        CASE
          WHEN side='BUY' THEN token_amount
          WHEN side='SELL' THEN -token_amount
          ELSE 0
        END
      ) AS balance
    FROM transactions
    WHERE token_address=$1
    GROUP BY wallet
    HAVING SUM(
      CASE
        WHEN side='BUY' THEN token_amount
        WHEN side='SELL' THEN -token_amount
        ELSE 0
      END
    ) > 0
    `,
    [tokenAddress.toLowerCase()]
  );

  const holders = {};
  for (const r of rows) {
    holders[r.wallet] = {
      balance: Number(r.balance)
    };
  }

  return holders;
}

/**
 * Get holder count
 */
export async function getHolderCount(tokenAddress) {
  const { rows } = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM (
      SELECT wallet
      FROM transactions
      WHERE token_address=$1
      GROUP BY wallet
      HAVING SUM(
        CASE
          WHEN side='BUY' THEN token_amount
          WHEN side='SELL' THEN -token_amount
          ELSE 0
        END
      ) > 0
    ) t
    `,
    [tokenAddress.toLowerCase()]
  );

  return Number(rows[0]?.count ?? 0);
}
