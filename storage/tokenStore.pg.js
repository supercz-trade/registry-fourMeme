// storage/tokenStore.pg.js
// FINAL — SuperCZ Token Registry (Postgres)
// Engine-first, lifecycle-aware

import { pool } from "../db/postgres.js";

function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Save token registry info
 * WILL NOT overwrite existing token
 */
export async function saveTokenLaunchInfo(registry) {
  if (!registry || !registry.tokenAddress) return;

  await pool.query(
    `
    INSERT INTO tokens (
      token_address,
      name,
      symbol,
      creator,

      launch_tx_hash,
      launch_time,
      launch_source,
      source_platform, -- [NEW]

      base_token,
      base_token_address,
      base_token_type,

      telegram,
      twitter,
      website,
      image,

      status,
      created_at
    )
    VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,
      $9,$10,$11,
      $12,$13,$14,$15,
      $16,$17
    )
    ON CONFLICT (token_address) DO NOTHING
    `,
    [
      registry.tokenAddress.toLowerCase(),
      registry.name ?? null,
      registry.symbol ?? null,
      registry.creator ?? null,

      registry.launchTxHash ?? null,
      registry.launchTime ?? null,
      registry.launchSource ?? "UNKNOWN",
      registry.sourcePlatform ?? "unknown", // [NEW]

      registry.baseToken ?? null,
      registry.baseTokenAddress ?? null,
      registry.baseTokenType ?? null,

      registry.metadata?.telegram ?? null,
      registry.metadata?.twitter ?? null,
      registry.metadata?.website ?? null,
      registry.metadata?.image ?? "default",

      registry.status ?? "TRADING_ACTIVE",
      registry.createdAt ?? now()
    ]
  );
}

/**
 * Load token registry info
 */
export async function loadTokenLaunchInfo(tokenAddress) {
  if (!tokenAddress) return null;

  const { rows } = await pool.query(
    `
    SELECT *
    FROM tokens
    WHERE token_address=$1
    `,
    [tokenAddress.toLowerCase()]
  );

  if (rows.length === 0) return null;
  const r = rows[0];

  return {
    tokenAddress: r.token_address,
    name: r.name,
    symbol: r.symbol,
    creator: r.creator,

    launchTxHash: r.launch_tx_hash,
    launchTime: r.launch_time,
    launchSource: r.launch_source,
    sourcePlatform: r.source_platform, // [NEW]

    baseToken: r.base_token,
    baseTokenAddress: r.base_token_address,
    baseTokenType: r.base_token_type,

    metadata: {
      telegram: r.telegram,
      twitter: r.twitter,
      website: r.website,
      image: r.image
    },

    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? null,
    migratedAt: r.migrated_at ?? null // [NEW]
  };
}

/**
 * Update token status only
 */
export async function updateTokenStatus(tokenAddress, status) {
  if (!tokenAddress || !status) return;

  await pool.query(
    `
    UPDATE tokens
    SET status=$1, updated_at=$2
    WHERE token_address=$3
    `,
    [
      status,
      now(),
      tokenAddress.toLowerCase()
    ]
  );
}

/**
 * Mark token as migrated
 */
export async function markTokenMigrated(tokenAddress) {
  if (!tokenAddress) return;

  await pool.query(
    `
    UPDATE tokens
    SET
      status='MIGRATED',
      launch_source='MIGRATION',
      migrated_at=$1,
      updated_at=$1
    WHERE token_address=$2
    `,
    [
      now(),
      tokenAddress.toLowerCase()
    ]
  );
}

/**
 * Check if token exists
 */
export async function tokenExists(tokenAddress) {
  if (!tokenAddress) return false;

  const { rows } = await pool.query(
    `
    SELECT 1
    FROM tokens
    WHERE token_address=$1
    LIMIT 1
    `,
    [tokenAddress.toLowerCase()]
  );

  return rows.length > 0;
}

/**
 * Get all tracked tokens
 */
export async function getAllTokens() {
  const { rows } = await pool.query(
    `
    SELECT token_address
    FROM tokens
    ORDER BY created_at ASC
    `
  );

  return rows.map(r => r.token_address);
}
