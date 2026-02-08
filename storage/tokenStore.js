// storage/tokenStore.js
// Token REGISTRY store (JSON-based)
// Synced with createToken.js (four.meme mode)

import fs from "fs";
import path from "path";

// ================= CONFIG =================
const BASE_DIR = path.resolve("./tokens");

// ================= HELPERS =================
function ensureBaseDir() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

function ensureTokenDir(tokenAddress) {
  ensureBaseDir();

  const dir = path.join(BASE_DIR, tokenAddress.toLowerCase());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getInfoPath(tokenAddress) {
  const dir = ensureTokenDir(tokenAddress);
  return path.join(dir, "infoTokenLaunch.json");
}

function now() {
  return Math.floor(Date.now() / 1000);
}

// ================= CORE API =================

/**
 * Save token registry info
 * Will NOT overwrite existing file
 */
export function saveTokenLaunchInfo(registry) {
  if (!registry || !registry.tokenAddress) return;

  const tokenAddress = registry.tokenAddress.toLowerCase();
  const filePath = getInfoPath(tokenAddress);

  // Do not overwrite existing registry
  if (fs.existsSync(filePath)) return;

  const payload = {
    // ===== IDENTITY =====
    tokenAddress,
    name: registry.name ?? null,
    symbol: registry.symbol ?? null,
    creator: registry.creator ?? null,

    // ===== LAUNCH INFO =====
    launchTxHash: registry.launchTxHash ?? null,
    launchTime: registry.launchTime ?? null,
    launchSource: registry.launchSource ?? null,

    // ===== REGISTRY PROVENANCE =====
    registryMode: registry.registryMode ?? "ONCHAIN",   // ONCHAIN | IMPORTED
    registryFrom: registry.registryFrom ?? "internal",  // internal | four_meme_api

    // ===== BASE TOKEN =====
    baseToken: registry.baseToken ?? null,
    baseTokenAddress: registry.baseTokenAddress ?? null,
    baseTokenType: registry.baseTokenType ?? null,

    // ===== METADATA =====
    metadata: {
      telegram: registry.metadata?.telegram ?? null,
      twitter: registry.metadata?.twitter ?? null,
      website: registry.metadata?.website ?? null,
      image: registry.metadata?.image ?? "default"
    },

    // ===== STATUS =====
    status: registry.status ?? "TRADING_ACTIVE",

    // ===== TIMESTAMP =====
    createdAt: now()
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}


/**
 * Load token registry info
 */
export function loadTokenLaunchInfo(tokenAddress) {
  if (!tokenAddress) return null;

  const filePath = getInfoPath(tokenAddress);
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Update token status
 * status: TRADING_ACTIVE | DEAD | RUG | IGNORED
 */
export function updateTokenStatus(tokenAddress, status) {
  const info = loadTokenLaunchInfo(tokenAddress);
  if (!info) return;

  info.status = status;
  info.updatedAt = now();

  const filePath = getInfoPath(tokenAddress);
  fs.writeFileSync(filePath, JSON.stringify(info, null, 2));
}

/**
 * Check if token already exists
 */
export function tokenExists(tokenAddress) {
  if (!tokenAddress) return false;
  const filePath = getInfoPath(tokenAddress);
  return fs.existsSync(filePath);
}

/**
 * Get all tracked tokens
 */
export function getAllTokens() {
  ensureBaseDir();

  return fs
    .readdirSync(BASE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name.toLowerCase());
}
