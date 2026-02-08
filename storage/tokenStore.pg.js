// storage/tokenStore.pg.js
// [NEW] PostgreSQL version of tokenStore
// Replaces JSON-based token registry

import { pool } from "../db/postgres.js";

function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Save token registry info
 * Will NOT overwrite existing token (same behavior as JSON)
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
      $5,$6,$7,
      $8,$9,$10,
      $11,$12,$13,$14,
      $15,$16
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
      registry.launchSource ?? null,

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
 * Same output shape as JSON version
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

    registryMode: "ONCHAIN",
    registryFrom: "internal",

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
    updatedAt: r.updated_at ?? null
  };
}

/**
 * Update token status
 * status: TRADING_ACTIVE | DEAD | RUG | IGNORED
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
 * Check if token already exists
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
 * Same output as JSON version: array of token addresses
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
