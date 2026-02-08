// storage/transactionStore.js
// Transaction store (append-only)
// Source of truth for holder & candle rebuild
// Supports DEV_BUY / BUY / SELL with explicit side

import fs from "fs";
import path from "path";

// ================= CONFIG =================
const DATA_DIR = path.resolve("./data/transactions");

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

function getTxFile(tokenAddress) {
  return path.join(getTokenDir(tokenAddress), "transactions.json");
}

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================= API =================

/**
 * Save transaction events (append-only)
 * Dedup by txHash + type + side + wallet
 *
 * Event schema:
 * {
 *   type: "DEV_BUY" | "BUY" | "SELL",
 *   side: "BUY" | "SELL",
 *   txHash,
 *   tokenAddress,
 *   wallet,
 *   tokenAmount,
 *   spendAmount,
 *   spendSymbol,
 *   spendUSD,
 *   baseTokenPriceUSD,
 *   priceUSD,
 *   marketcapAtTxUSD,
 *   time
 * }
 */
export function saveTransactions(tokenAddress, events = []) {
  if (!tokenAddress || !Array.isArray(events) || events.length === 0) return;

  const file = getTxFile(tokenAddress);
  const existing = readJSON(file);

  const seen = new Set(
    existing.map(
      e => `${e.txHash}:${e.type}:${e.side}:${e.wallet}`
    )
  );

  const merged = [...existing];

  for (const e of events) {
    if (
      !e ||
      !e.txHash ||
      !e.type ||
      !e.side ||
      !e.wallet
    ) continue;

    const key = `${e.txHash}:${e.type}:${e.side}:${e.wallet}`;
    if (seen.has(key)) continue;

    merged.push({
      type: e.type,
      side: e.side,

      txHash: e.txHash,
      tokenAddress: tokenAddress.toLowerCase(),
      wallet: e.wallet.toLowerCase(),

      tokenAmount: Number(e.tokenAmount ?? 0),

      spendAmount: Number(e.spendAmount ?? 0),
      spendSymbol: e.spendSymbol ?? null,
      spendUSD: Number(e.spendUSD ?? 0),

      baseTokenPriceUSD:
        e.baseTokenPriceUSD !== undefined
          ? Number(e.baseTokenPriceUSD)
          : null,

      priceUSD:
        e.priceUSD !== undefined
          ? Number(e.priceUSD)
          : null,

      marketcapAtTxUSD:
        e.marketcapAtTxUSD !== undefined
          ? Number(e.marketcapAtTxUSD)
          : null,

      time: Number(e.time ?? Date.now())
    });

    seen.add(key);
  }

  writeJSON(file, merged);
}

/**
 * Get latest N transactions for a token
 */
export function getLatestTransactions(tokenAddress, limit = 50) {
  const file = getTxFile(tokenAddress);
  const data = readJSON(file);

  return data
    .sort((a, b) => b.time - a.time)
    .slice(0, limit);
}

/**
 * Get all transactions for a token
 * (for replay / candle rebuild)
 */
export function getAllTransactions(tokenAddress) {
  return readJSON(getTxFile(tokenAddress));
}
