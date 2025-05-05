// scripts/measureDsql.js
// Measure Aurora DSQL ledger SELECT latency for a given soulContractId.

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client }     = require("pg");
const { performance } = require("perf_hooks");

async function measureDSQL(soulId) {
  const endpoint = process.env.DSQL_ENDPOINT || "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws";
  const region   = process.env.AWS_REGION   || "us-east-1";

  // 1) Generate IAM token
  const signer = new DsqlSigner({ hostname: endpoint, region });
  const token  = await signer.getDbConnectAdminAuthToken();

  // 2) Connect
  const client = new Client({
    host: endpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // 3) Measure SELECT
  const t0 = performance.now();
  const res = await client.query(
    `SELECT id, amount, transaction_time, description
       FROM soul_ledger
      WHERE soul_contract_id = $1
   ORDER BY transaction_time ASC;`,
    [soulId]
  );
  const t1 = performance.now();

  console.log(`✅ Aurora DSQL: fetched ${res.rowCount} rows in ${(t1 - t0).toFixed(2)} ms`);
  await client.end();
  return res.rows;
}

(async () => {
  try {
    await measureDSQL("soul-001");
  } catch (err) {
    console.error("❌ Error measuring Aurora DSQL:", err);
    process.exit(1);
  }
})();
