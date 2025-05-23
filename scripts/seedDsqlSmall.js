// scripts/seedDsqlSmall.js
/**
 * Aurora DSQL “Small” seed script (no FOREIGN KEY constraints).
 * - Creates tables if they don’t exist.
 * - Uses CREATE INDEX ASYNC for preview compatibility.
 * - Inserts 10 souls, each with 100 events & 100 ledger entries.
 *
 * Usage:
 *   npm install @aws-sdk/dsql-signer pg
 *   node scripts/seedDsqlSmall.js
 */

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client }      = require("pg");

async function main() {
  const endpoint = "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws";
  const region   = "us-east-1";

  console.log(`🔧 Connecting to Aurora DSQL at ${endpoint}…`);

  // 1) Generate IAM auth token
  const signer = new DsqlSigner({ hostname: endpoint, region });
  let token;
  try {
    token = await signer.getDbConnectAdminAuthToken();
  } catch (err) {
    console.error("❌ Failed to generate auth token:", err);
    process.exit(1);
  }

  // 2) Open Postgres connection
  const client = new Client({
    host: endpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // 3) Create tables & async indexes (no FK constraints)
    console.log("📐 Ensuring tables and ASYNC indexes exist…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS soul_contracts (
        id              TEXT PRIMARY KEY,
        contract_status TEXT NOT NULL,
        updated_at      TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soul_contract_events (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        soul_contract_id TEXT NOT NULL,
        event_time       TIMESTAMP NOT NULL,
        description      TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS soul_ledger (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        soul_contract_id TEXT NOT NULL,
        amount           NUMERIC NOT NULL,
        transaction_time TIMESTAMP NOT NULL,
        description      TEXT NOT NULL
      );
    `);

    // 4) Seed 10 souls
    console.log("🌱 Seeding 10 souls…");
    for (let i = 1; i <= 10; i++) {
      const id = `soul-${String(i).padStart(3, "0")}`;

      // Upsert master contract
      await client.query(
        `INSERT INTO soul_contracts(id, contract_status, updated_at)
           VALUES($1, $2, NOW())
         ON CONFLICT(id) DO UPDATE
           SET contract_status = EXCLUDED.contract_status,
               updated_at      = EXCLUDED.updated_at;`,
        [id, "Under Contract"]
      );

      // Insert 100 events
      for (let j = 0; j < 100; j++) {
        await client.query(
          `INSERT INTO soul_contract_events(soul_contract_id, event_time, description)
             VALUES($1, NOW() + ($2 * INTERVAL '1 minute'), $3);`,
          [id, i * 100 + j, `Event #${j + 1} for ${id}`]
        );
      }

      // Insert 100 ledger entries
      for (let j = 0; j < 100; j++) {
        const amount = (Math.random() * 100).toFixed(2);
        await client.query(
          `INSERT INTO soul_ledger(soul_contract_id, amount, transaction_time, description)
             VALUES($1, $2, NOW() + ($3 * INTERVAL '1 minute'), $4);`,
          [id, amount, i * 200 + j, `Charge #${j + 1} for ${id}`]
        );
      }

      process.stdout.write(` • seeded ${id}\n`);
    }

    console.log("✅ Aurora DSQL seeding complete!");
  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
