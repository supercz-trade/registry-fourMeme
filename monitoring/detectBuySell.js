// monitoring/detectBuySell.js
// FINAL — BUY + SELL ORCHESTRATOR (User-direction based)

import { detectBuy } from "./detectBuy.js";
import { detectSell } from "./detectSell.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const safeLower = (v) => (typeof v === "string" ? v.toLowerCase() : null);

function addrFromTopic(topic) {
  return "0x" + topic.slice(26);
}

export async function detectBuySell(ctx) {
  const { tx, receipt } = ctx;

  if (!tx || !receipt) return [];

  const user = safeLower(tx.from);

  if (!user) return [];

  let isBuy = false;   // [MODIFIED]
  let isSell = false;  // [MODIFIED]

  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.topics.length !== 3) continue;

    const from = safeLower(addrFromTopic(log.topics[1]));
    const to = safeLower(addrFromTopic(log.topics[2]));

    // ===== USER-BASED DIRECTION =====

    if (to === user) {
      isBuy = true;     // [NEW]
    }

    if (from === user) {
      isSell = true;    // [NEW]
    }
  }

  // ===== EDGE CASE =====
  // Bisa terjadi pada complex swap (approve + transfer)
  // Jika dua-duanya true → jalankan keduanya

  if (isBuy && isSell) {         // [NEW]
    const buys = await detectBuy(ctx);
    const sells = await detectSell(ctx);
    return [...buys, ...sells];
  }

  if (isBuy) {
    return await detectBuy(ctx);
  }

  if (isSell) {
    return await detectSell(ctx);
  }

  return [];
}
