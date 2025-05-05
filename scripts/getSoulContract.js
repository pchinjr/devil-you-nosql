// scripts/getSoulContract.js

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client } = require("pg");

async function main() {
  const soulContractId = "soul-123";
  const endpoint        = "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws";
  const region          = "us-east-1";

  console.log(`Fetching data for contract "${soulContractId}" from ${endpoint}…`);

  // 1) Generate IAM token
  const signer = new DsqlSigner({ hostname: endpoint, region });
  let token;
  try {
    token = await signer.getDbConnectAdminAuthToken();
  } catch (err) {
    console.error("❌ Failed to generate IAM token:", err);
    process.exit(1);
  }

  // 2) Connect to the database
  const client = new Client({
    host: endpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // 3) Fetch the contract (no created_at column)
    const contractRes = await client.query(
      `SELECT id, contract_status, updated_at
         FROM soul_contracts
        WHERE id = $1`,
      [soulContractId]
    );

    if (contractRes.rowCount === 0) {
      console.log(`⚠️  No contract found for id="${soulContractId}"`);
    } else {
      console.log("📄 Contract:");
      console.table(contractRes.rows);
    }

    // 4) Fetch events
    const eventsRes = await client.query(
      `SELECT id, event_time, description
         FROM soul_contract_events
        WHERE soul_contract_id = $1
     ORDER BY event_time ASC`,
      [soulContractId]
    );
    console.log("🗒  Events:");
    console.table(eventsRes.rows);

    // 5) Fetch ledger entries
    const ledgerRes = await client.query(
      `SELECT id, amount, transaction_time, description
         FROM soul_ledger
        WHERE soul_contract_id = $1
     ORDER BY transaction_time ASC`,
      [soulContractId]
    );
    console.log("💰 Ledger Entries:");
    console.table(ledgerRes.rows);

  } catch (err) {
    console.error("❌ Error fetching DSQL data:", err);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
