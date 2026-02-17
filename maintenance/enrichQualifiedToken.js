// maintenance/enrichQualifiedToken.js
// FINAL — enrich metadata for qualified tokens (SET-BASED CANDIDATE SELECTION)
// Logs: token_address || updated_fields

import { pool } from "../db/postgres.js";
import { fetchTokenMeta } from "../services/fetchTokenMeta_api.js";

function now() {
  return Math.floor(Date.now() / 1000);
}

async function updateMetadata(token, meta) {
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
      meta.image ?? null,
      meta.website ?? null,
      meta.twitter ?? null,
      meta.telegram ?? null,
      now(),
      token
    ]
  );
}

export async function enrichQualifiedTokens() {
  console.log("[ENRICH] qualified token scan started");

  // =========================
  // SET-BASED CANDIDATE QUERY
  // =========================
  const { rows: tokens } = await pool.query(
    `
    SELECT token_address
    FROM tokens
    WHERE is_qualified = true
      AND (
        image = 'default'
        OR website IS NULL
        OR twitter IS NULL
        OR telegram IS NULL
      )
    `
  );

  if (tokens.length === 0) {
    console.log("[ENRICH] no candidates");
    return;
  }

  console.log(`[ENRICH] candidates=${tokens.length}`);

  let enriched = 0;

  // =========================
  // API-BOUND LOOP (UNAVOIDABLE)
  // =========================
  for (const t of tokens) {
    const token = t.token_address;

    let meta;
    try {
      meta = await fetchTokenMeta(token);
    } catch {
      continue;
    }

    if (!meta?.metadata) continue;

    const m = meta.metadata;

    const payload = {
      image: m.image && m.image !== "default" ? m.image : null,
      website: m.website || null,
      twitter: m.twitter || null,
      telegram: m.telegram || null
    };

    if (!payload.image && !payload.website && !payload.twitter && !payload.telegram) {
      continue;
    }

    await updateMetadata(token, payload);
    enriched++;

    // =========================
    // DETAILED LOGGING
    // =========================
    console.log(
      `[ENRICHED] ${token}` +
      ` || img=${!!payload.image}` +
      ` || web=${!!payload.website}` +
      ` || tw=${!!payload.twitter}` +
      ` || tg=${!!payload.telegram}`
    );
  }

  console.log(`[ENRICH] finished | enriched=${enriched}`);
}
