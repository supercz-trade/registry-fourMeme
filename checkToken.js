// checkToken.js
// FINAL — SuperCZ Maintenance Orchestrator
// Runs: cleanup → qualify → enrich

import cron from "node-cron";

import { cleanupDeadTokens } from "./maintenance/cleanupDeadTokens.js";
import { qualifyTokens } from "./maintenance/qualifyToken.js";
import { enrichQualifiedTokens } from "./maintenance/enrichQualifiedToken.js";

async function runStep(name, fn) {
  const start = Date.now();
  try {
    console.log(`\n[CHECK] ${name} started`);
    await fn();
    const dur = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[CHECK] ${name} finished (${dur}s)`);
  } catch (err) {
    console.error(`[CHECK] ${name} FAILED`);
    console.error(err);
  }
}

async function runAll() {
  console.log("======================================");
  console.log("[SYSTEM] SuperCZ checkToken cycle start");
  console.log("======================================");

  await runStep("cleanupDeadTokens", cleanupDeadTokens);
  await runStep("qualifyTokens", qualifyTokens);
  await runStep("enrichQualifiedTokens", enrichQualifiedTokens);

  console.log("======================================");
  console.log("[SYSTEM] SuperCZ checkToken cycle end");
  console.log("======================================");
}

// every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  await runAll();
});

// optional: run once on startup
(async () => {
  console.log("[SYSTEM] SuperCZ checkToken service started");
  await runAll();
})();
