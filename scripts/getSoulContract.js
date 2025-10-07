// scripts/getSoulContract.js

/**
 * Demo reader for Ghost Rider’s devilish soul contracts.
 * Hard-coded parameters:
 *   soulContractId = "soul-123"
 *   endpoint       = "xxxxxxxxxxxxxx.dsql.us-east-1.on.aws"
 *   region         = "us-east-1"
 */

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client }       = require("pg");

async function main() {
  const soulContractId = "soul-123";
  const endpoint       = "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws";
  const region         = "us-east-1";

  console.log(`🔍 Fetching soulContract "${soulContractId}" from ${endpoint}`);

  // 1) Get IAM token
  const signer = new DsqlSigner({ hostname: endpoint, region });
  let token;
  try {
    token = await signer.getDbConnectAdminAuthToken();
  } catch (err) {
    console.error("❌ Token error:", err);
    process.exit(1);
  }

  // 2) Connect
  const client = new Client({
    host: endpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // 3) Read the master contract
    const cRes = await client.query(
      `SELECT id, contract_status, updated_at
         FROM soul_contracts
        WHERE id = $1`,
      [soulContractId]
    );
    console.log("\n📄 Soul Contract:");
    console.table(cRes.rows);

    // 4) Read all events
    const eRes = await client.query(
      `SELECT id, event_time, description
         FROM soul_contract_events
        WHERE soul_contract_id = $1
     ORDER BY event_time`,
      [soulContractId]
    );
    console.log("\n🗒  Events:");
    console.table(eRes.rows);

    // 5) Read ledger entries
    const lRes = await client.query(
      `SELECT id, amount, transaction_time, description
         FROM soul_ledger
        WHERE soul_contract_id = $1
     ORDER BY transaction_time`,
      [soulContractId]
    );
    console.log("\n💰 Ledger Entries:");
    console.table(lRes.rows);

  } catch (err) {
    console.error("❌ Read error:", err);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("❌ Unexpected:", err);
  process.exit(1);
});