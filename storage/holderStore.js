// storage/holderStore.js
// Track holders & balances per token
// Source of truth: transactionStore (side-based)

import fs from "fs";
import path from "path";

// ================= CONFIG =================
const DATA_DIR = path.resolve("./data/holders");

// ================= INIT =================
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ================= HELPERS =================
function getTokenDir(tokenAddress) {
  const dir = path.join(DATA_DIR, tokenAddress.toLowerCase());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getFile(tokenAddress) {
  return path.join(getTokenDir(tokenAddress), "holders.json");
}

function readJSON(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function now() {
  return Math.floor(Date.now() / 1000);
}

// ================= API =================

/**
 * Update holders from transaction events
 * Uses e.side: "BUY" | "SELL"
 */
export function updateHolders(tokenAddress, events = []) {
  if (!tokenAddress || !Array.isArray(events) || events.length === 0) return;

  const file = getFile(tokenAddress);
  const holders = readJSON(file);

  for (const e of events) {
    if (!e || !e.wallet || !e.side) continue;

    const wallet = e.wallet.toLowerCase();
    const amount = Number(e.tokenAmount ?? 0);
    if (amount <= 0) continue;

    if (!holders[wallet]) {
      holders[wallet] = {
        balance: 0,
        firstSeenAt: e.time ?? now(),
        lastUpdatedAt: e.time ?? now(),
        source: e.type === "DEV_BUY" ? "genesis" : "market"
      };
    }

    if (e.side === "BUY") {
      holders[wallet].balance += amount;
    } else if (e.side === "SELL") {
      holders[wallet].balance -= amount;
    }

    holders[wallet].lastUpdatedAt = e.time ?? now();

    // Remove holder if balance <= 0
    if (holders[wallet].balance <= 0) {
      delete holders[wallet];
    }
  }

  writeJSON(file, holders);
}

/**
 * Get holder count
 */
export function getHolderCount(tokenAddress) {
  const holders = readJSON(getFile(tokenAddress));
  return Object.keys(holders).length;
}

/**
 * Get all holders (for analysis / UI)
 */
export function getAllHolders(tokenAddress) {
  return readJSON(getFile(tokenAddress));
}
