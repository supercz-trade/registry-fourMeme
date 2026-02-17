// maintenance/tokenLifecycle.js
// FINAL — PER-TOKEN QUALIFY + ENRICH (REALTIME SAFE)
// DEAD CLEANUP — DAILY SET-BASED

import { pool } from "../db/postgres.js";
import { getHolderCount } from "../storage/holderStore.pg.js";
import { fetchTokenMeta } from "../services/fetchTokenMeta_api.js";

// ================= CONFIG =================

const MIN_TX = 50;
const MIN_MCAP = 20_000;
const MIN_HOLDERS = 25;

const ONE_DAY = 24 * 60 * 60;
const DEAD_MCAP_USD = 5_000;

// ================= UTILS =================

function now() {
  return Math.floor(Date.now() / 1000);
}

// =====================================================
// REALTIME — QUALIFY SINGLE TOKEN
// =====================================================

export async function tryQualifySingleToken(token) {

  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*) AS tx_count,
      COALESCE(MAX(marketcap_at_tx_usd), 0) AS max_mcap
    FROM transactions
    WHERE token_address = $1
      AND type = 'TRADE'
    `,
    [token]
  );

  if (!rows.length) return false;

  const txCount = Number(rows[0].tx_count);
  const maxMcap = Number(rows[0].max_mcap);

  if (txCount < MIN_TX) return false;
  if (maxMcap < MIN_MCAP) return false;

  const holders = await getHolderCount(token);
  if (holders < MIN_HOLDERS) return false;

  const ts = now();

  const res = await pool.query(
    `
    UPDATE tokens
    SET
      is_qualified = true,
      qualified_at = $1,
      updated_at = $2
    WHERE token_address = $3
      AND (is_qualified IS NULL OR is_qualified = false)
    `,
    [ts, ts, token]
  );

  if (res.rowCount > 0) {
    console.log(
      `[QUALIFIED][REALTIME] ${token}` +
      ` || tx=${txCount}` +
      ` || mcap=${maxMcap}` +
      ` || holders=${holders}`
    );

    // langsung enrich saat pertama kali qualified
    await tryEnrichSingleToken(token);
  }

  return res.rowCount > 0;
}

// =====================================================
// REALTIME — ENRICH SINGLE TOKEN
// =====================================================

export async function tryEnrichSingleToken(token) {

  const { rows } = await pool.query(
    `
    SELECT image, website, twitter, telegram
    FROM tokens
    WHERE token_address = $1
    `,
    [token]
  );

  if (!rows.length) return;

  const row = rows[0];

  const needsEnrich =
    row.image === "default" ||
    !row.website ||
    !row.twitter ||
    !row.telegram;

  if (!needsEnrich) return;

  let meta;
  try {
    meta = await fetchTokenMeta(token);
  } catch {
    return;
  }

  if (!meta?.metadata) return;

  const m = meta.metadata;

  const payload = {
    image: m.image && m.image !== "default" ? m.image : null,
    website: m.website || null,
    twitter: m.twitter || null,
    telegram: m.telegram || null
  };

  if (!payload.image && !payload.website && !payload.twitter && !payload.telegram) {
    return;
  }

  await pool.query(
    `
    UPDATE tokens
    SET
      image = COALESCE($1, image),
      website = COALESCE($2, website),
      twitter = COALESCE($3, twitter),
      telegram = COALESCE($4, telegram),
      updated_at = $5
    WHERE token_address = $6
    `,
    [
      payload.image,
      payload.website,
      payload.twitter,
      payload.telegram,
      now(),
      token
    ]
  );

  console.log(
    `[ENRICHED][REALTIME] ${token}` +
    ` || img=${!!payload.image}` +
    ` || web=${!!payload.website}` +
    ` || tw=${!!payload.twitter}` +
    ` || tg=${!!payload.telegram}`
  );
}

// =====================================================
// DAILY — CLEANUP DEAD TOKENS (SET-BASED)
// =====================================================

export async function cleanupDeadTokensDaily() {

  console.log("[CLEANUP] daily dead token scan started");

  const ts = now();
  const since = ts - ONE_DAY;

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

  console.log(`[CLEANUP] finished || dead=${res.rowCount}`);
}
