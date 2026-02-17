// services/config.js
// ===== CONFIGURATION FILE =====
// PENTING: File ini load env variable dan export ke semua module lain

// ⚠️ CRITICAL: dotenv harus di-import DI SINI
// Jangan di file lain, hanya di sini!
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

/**
 * Centralized configuration
 * 
 * Semua module import CONFIG dari sini
 * Jangan import process.env langsung!
 */
export const CONFIG = {
  // ===== BLOCKCHAIN =====
  BSC_RPC: process.env.BSC_RPC || "https://bsc-dataseed1.binance.org",
  BSC_WSS: process.env.BSC_WSS || "wss://bsc-ws-node.niledb.com",
  
  // ===== CONTRACTS =====
  HELPER3: "0xF251F83e40a78868FcfA3FA4599Dad6494E46034",
  FOUR_MEME_MANAGER: process.env.FOUR_MEME_MANAGER ,
  
  // ===== DATABASE =====
  PG_HOST: process.env.PG_HOST || "localhost",
  PG_PORT: process.env.PG_PORT || 5432,
  PG_USER: process.env.PG_USER || "postgres",
  PG_PASSWORD: process.env.PG_PASSWORD || "",
  PG_DB: process.env.PG_DB || "postgres",
  PG_SSL: process.env.PG_SSL === "true",
  
  // ===== SYSTEM =====
  NODE_ENV: process.env.NODE_ENV || "development",
  DEBUG: process.env.DEBUG === "true" || true,
  PORT: process.env.PORT || 3000
};

// ===== VALIDATE CRITICAL CONFIG =====
if (!CONFIG.BSC_RPC || CONFIG.BSC_RPC.trim() === "") {
  console.error("[CONFIG] ❌ BSC_RPC is not set in .env file!");
  console.error("[CONFIG] Please add: BSC_RPC=https://your-rpc-url");
  process.exit(1);
}

if (!CONFIG.FOUR_MEME_MANAGER || !CONFIG.FOUR_MEME_MANAGER.startsWith("0x")) {
  console.error("[CONFIG] ❌ FOUR_MEME_MANAGER is invalid!");
  console.error("[CONFIG] Please set in .env file");
  process.exit(1);
}

// ===== LOG LOADED CONFIG =====
if (CONFIG.DEBUG) {
  console.log("[CONFIG] ✅ Configuration loaded:");
  console.log("[CONFIG]   NODE_ENV:", CONFIG.NODE_ENV);
  console.log("[CONFIG]   BSC_RPC:", CONFIG.BSC_RPC.substring(0, 50) + "...");
  console.log("[CONFIG]   HELPER3:", CONFIG.HELPER3);
  console.log("[CONFIG]   MANAGER:", CONFIG.FOUR_MEME_MANAGER);
  console.log("[CONFIG]   DEBUG:", CONFIG.DEBUG);
}

export default CONFIG;