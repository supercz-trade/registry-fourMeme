// maintenance/enrichQualifiedToken.js
// FINAL — enrich metadata for qualified tokens only

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
      meta.image || null,
      meta.website || null,
      meta.twitter || null,
      meta.telegram || null,
      now(),
      token
    ]
  );
}

export async function enrichQualifiedTokens() {
  console.log("[ENRICH] qualified token scan started");

  const { rows: tokens } = await pool.query(
    `
    SELECT token_address, image, website, twitter, telegram
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

  let enriched = 0;

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
    if (!m.image && !m.website && !m.twitter && !m.telegram) continue;

    await updateMetadata(token, {
      image: m.image && m.image !== "default" ? m.image : null,
      website: m.website,
      twitter: m.twitter,
      telegram: m.telegram
    });

    enriched++;

    console.log(
      `[ENRICHED] ${token}` +
      ` | img=${!!m.image}` +
      ` | web=${!!m.website}` +
      ` | tw=${!!m.twitter}` +
      ` | tg=${!!m.telegram}`
    );
  }

  console.log(`[ENRICH] finished | enriched=${enriched}`);
}
