// storage/transactionStore.pg.js
// FINAL — PostgreSQL version
// SOURCE OF TRUTH
// FIXED: time normalization (ALWAYS unix seconds)

import { pool } from "../db/postgres.js";

/**
 * Normalize time to UNIX SECONDS
 * Accepts seconds or milliseconds
 */
function normalizeTime(t) {
  if (!t) return Math.floor(Date.now() / 1000);

  // if milliseconds
  if (t > 1e12) return Math.floor(t / 1000);

  // already seconds
  return Math.floor(t);
}

/**
 * Save transaction events (append-only)
 * Dedup: txHash + type + side + wallet
 */
export async function saveTransactions(tokenAddress, events = []) {
  if (!tokenAddress || !Array.isArray(events) || events.length === 0) return;

  for (const e of events) {
    if (!e?.txHash || !e.wallet || !e.type || !e.side) continue;

    const timeSec = normalizeTime(e.time);

    await pool.query(
      `
      INSERT INTO transactions (
        tx_hash,
        token_address,
        wallet,
        type,
        side,
        token_amount,
        spend_amount,
        spend_symbol,
        spend_usd,
        base_token_price_usd,
        price_usd,
        marketcap_at_tx_usd,
        time
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (tx_hash, type, side, wallet) DO NOTHING
      `,
      [
        e.txHash,
        tokenAddress.toLowerCase(),
        e.wallet.toLowerCase(),
        e.type,
        e.side,
        Number(e.tokenAmount ?? 0),
        Number(e.spendAmount ?? 0),
        e.spendSymbol ?? null,
        Number(e.spendUSD ?? 0),
        e.baseTokenPriceUSD ?? null,
        e.priceUSD ?? null,
        e.marketcapAtTxUSD ?? null,
        timeSec
      ]
    );
  }
}

/**
 * Get all transactions (for replay / rebuild)
 */
export async function getAllTransactions(tokenAddress) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM transactions
    WHERE token_address=$1
    ORDER BY time ASC
    `,
    [tokenAddress.toLowerCase()]
  );
  return rows;
}

/**
 * Get latest N transactions
 */
export async function getLatestTransactions(tokenAddress, limit = 50) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM transactions
    WHERE token_address=$1
    ORDER BY time DESC
    LIMIT $2
    `,
    [tokenAddress.toLowerCase(), limit]
  );
  return rows;
}

export async function getTransactionsByTx(txHash) {
  if (!txHash) return [];

  const { rows } = await pool.query(
    `
    SELECT *
    FROM transactions
    WHERE tx_hash=$1
    ORDER BY time ASC
    `,
    [txHash]
  );
}