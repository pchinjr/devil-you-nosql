// scripts/createDsqlIndexes.js
/**
 * Idempotent creation of ASYNC indexes on soul_contract_events and soul_ledger.
 * Safely handles “index already exists” (no job_id returned).
 *
 * Usage:
 *   npm install @aws-sdk/dsql-signer pg
 *   export DSQL_ENDPOINT=xxxxxxxxxxxxxxxxxx.dsql.us-east-1.on.aws
 *   node scripts/createDsqlIndexes.js
 */

require('dotenv').config();
const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client }      = require("pg");

async function main() {
  const endpoint = process.env.DSQL_ENDPOINT;
  if (!endpoint) {
    console.error("❌ Please set DSQL_ENDPOINT env var");
    process.exit(1);
  }
  const region = process.env.AWS_REGION || "us-east-1";

  console.log(`🔌 Connecting to Aurora DSQL at ${endpoint}…`);

  // 1) Generate IAM auth token
  const signer = new DsqlSigner({ hostname: endpoint, region });
  let token;
  try {
    token = await signer.getDbConnectAdminAuthToken();
  } catch (err) {
    console.error("❌ Failed to generate IAM token:", err);
    process.exit(1);
  }

  // 2) Connect via pg Client
  const client = new Client({
    host: endpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // 3) Create ASYNC index on soul_contract_events
    console.log("🚀 Creating ASYNC index on soul_contract_events (if not exists)...");
    const res1 = await client.query(
      `CREATE INDEX ASYNC IF NOT EXISTS ix_events_scid
         ON soul_contract_events(soul_contract_id);`
    );
    if (res1.rows.length && res1.rows[0].job_id) {
      console.log("➡️  Started index job ix_events_scid:", res1.rows[0].job_id);
    } else {
      console.log("ℹ️  ix_events_scid already exists, no job started.");
    }

    // 4) Create ASYNC index on soul_ledger
    console.log("🚀 Creating ASYNC index on soul_ledger (if not exists)...");
    const res2 = await client.query(
      `CREATE INDEX ASYNC IF NOT EXISTS ix_ledger_scid
         ON soul_ledger(soul_contract_id);`
    );
    if (res2.rows.length && res2.rows[0].job_id) {
      console.log("➡️  Started index job ix_ledger_scid:", res2.rows[0].job_id);
    } else {
      console.log("ℹ️  ix_ledger_scid already exists, no job started.");
    }

    console.log("✅ Index creation commands completed.");
    console.log("   To monitor any running jobs, run:\n   SELECT * FROM sys.jobs;");
  } catch (err) {
    console.error("❌ Error creating indexes:", err);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
