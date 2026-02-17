// storage/tokenStore.pg.js
// FINAL — SuperCZ Token Registry (Postgres)
// Engine-first, lifecycle-aware
// [MODIFIED] save extra fields: description, tax, liquidity_type, red_flag,
// min_buy, max_buy, contract_verified

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
      source_platform,

      base_token,
      base_token_address,
      base_token_type,

      telegram,
      twitter,
      website,
      image,

      description,
      tax,
      liquidity_type,
      red_flag,
      min_buy,
      max_buy,
      contract_verified,

      status,
      created_at
    )
    VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,
      $9,$10,$11,
      $12,$13,$14,$15,
      $16,$17,$18,$19,$20,$21,$22,
      $23,$24
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
      registry.sourcePlatform ?? "unknown",

      registry.baseToken ?? null,
      registry.baseTokenAddress ?? null,
      registry.baseTokenType ?? null,

      registry.metadata?.telegram ?? null,
      registry.metadata?.twitter ?? null,
      registry.metadata?.website ?? null,
      registry.metadata?.image ?? "default",

      registry.description ?? null,
      registry.tax ?? null,
      registry.liquidityType ?? null,
      registry.redFlag ?? null,
      registry.minBuy ?? null,
      registry.maxBuy ?? null,
      registry.contractVerified ?? null,

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
    sourcePlatform: r.source_platform,

    baseToken: r.base_token,
    baseTokenAddress: r.base_token_address,
    baseTokenType: r.base_token_type,

    metadata: {
      telegram: r.telegram,
      twitter: r.twitter,
      website: r.website,
      image: r.image
    },

    description: r.description,
    tax: r.tax,
    liquidityType: r.liquidity_type,
    redFlag: r.red_flag,
    minBuy: r.min_buy,
    maxBuy: r.max_buy,
    contractVerified: r.contract_verified,

    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? null,
    migratedAt: r.migrated_at ?? null
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

/**
 * Flexible update token info (partial update)
 */
export async function updateTokenInfo(tokenAddress, updates = {}) {
  if (!tokenAddress || !updates || Object.keys(updates).length === 0) return;

  const fields = [];
  const values = [];
  let idx = 1;

  const map = {
    name: "name",
    symbol: "symbol",
    creator: "creator",

    description: "description",
    tax: "tax",
    liquidityType: "liquidity_type",
    redFlag: "red_flag",
    minBuy: "min_buy",
    maxBuy: "max_buy",
    contractVerified: "contract_verified",

    launchSource: "launch_source",
    sourcePlatform: "source_platform",

    baseToken: "base_token",
    baseTokenAddress: "base_token_address",
    baseTokenType: "base_token_type",

    status: "status"
  };

  for (const key in updates) {
    if (!(key in map)) continue;
    fields.push(`${map[key]}=$${idx}`);
    values.push(updates[key]);
    idx++;
  }

  if (fields.length === 0) return;

  fields.push(`updated_at=$${idx}`);
  values.push(now());
  idx++;

  await pool.query(
    `
    UPDATE tokens
    SET ${fields.join(", ")}
    WHERE token_address=$${idx}
    `,
    [...values, tokenAddress.toLowerCase()]
  );
}
