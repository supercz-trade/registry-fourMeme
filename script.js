// scripts/readErrors.js
// SuperCZ — Error Log Reader (Postgres / Neon)

import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

// ================= DATABASE CONFIG =================
// [MODIFIED] gunakan PG_* dari .env

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  ssl: process.env.PG_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
});

async function getRecentErrors(limit = 20) {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      tx_hash,
      token_address,
      wallet,
      error_type,
      error_message,
      debug_data,
      created_at
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

async function getErrorsByTx(txHash) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM error_logs
    WHERE tx_hash=$1
    ORDER BY created_at ASC
    `,
    [txHash]
  );
  return rows;
}

async function getErrorsByType(type, limit = 50) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM error_logs
    WHERE error_type=$1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [type, limit]
  );
  return rows;
}

async function getErrorsSince(secondsAgo = 3600) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM error_logs
    WHERE created_at >= NOW() - INTERVAL '${secondsAgo} seconds'
    ORDER BY created_at DESC
    `
  );
  return rows;
}

async function main() {
  const args = process.argv.slice(2);

  if (!args.length) {
    console.log("Usage:");
    console.log(" node scripts/readErrors.js recent 20");
    console.log(" node scripts/readErrors.js tx 0xHASH");
    console.log(" node scripts/readErrors.js type ERROR_TYPE");
    console.log(" node scripts/readErrors.js since 3600");
    process.exit(0);
  }

  const command = args[0];
  let result = [];

  try {
    switch (command) {
      case "recent":
        result = await getRecentErrors(Number(args[1]) || 20);
        break;

      case "tx":
        result = await getErrorsByTx(args[1]);
        break;

      case "type":
        result = await getErrorsByType(args[1]);
        break;

      case "since":
        result = await getErrorsSince(Number(args[1]) || 3600);
        break;

      default:
        console.log("Unknown command");
        process.exit(0);
    }

    console.log("=================================");
    console.log(`Found ${result.length} error(s)`);
    console.log("=================================");

    for (const r of result) {
      console.log({
        id: r.id,
        tx: r.tx_hash,
        type: r.error_type,
        msg: r.error_message,
        token: r.token_address,
        wallet: r.wallet,
        time: r.created_at
      });
    }

  } catch (err) {
    console.error("Query failed:", err.message);
  } finally {
    await pool.end();
  }
}

main();
