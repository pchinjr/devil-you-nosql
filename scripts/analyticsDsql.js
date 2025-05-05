// scripts/analyticsDsql.js
/**
 * Analytics in Node for Aurora DSQL “soul_ledger” table:
 *   Runs a single SQL with CTE + window functions to compute
 *   daily totals, running total, and day rank per soul.
 */

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client }     = require("pg");
const { performance } = require("perf_hooks");

async function analyticsDsql() {
  const endpoint = process.env.DSQL_ENDPOINT ||
    "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws";
  const region = process.env.AWS_REGION || "us-east-1";

  // 1) Generate IAM authentication token
  const signer = new DsqlSigner({ hostname: endpoint, region });
  const token  = await signer.getDbConnectAdminAuthToken();

  // 2) Connect once
  const client = new Client({
    host: endpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // 3) Define our “best‐for‐DSQL” query
  const sql = `
    WITH daily_ledgers AS (
      SELECT
        soul_contract_id,
        transaction_time::date AS tx_date,
        SUM(amount)            AS daily_amount
      FROM soul_ledger
      GROUP BY soul_contract_id, tx_date
    )
    SELECT
      soul_contract_id,
      tx_date,
      daily_amount,
      SUM(daily_amount) 
        OVER (
          PARTITION BY soul_contract_id
          ORDER BY tx_date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_total,
      RANK() 
        OVER (
          PARTITION BY soul_contract_id
          ORDER BY daily_amount DESC
        ) AS day_rank
    FROM daily_ledgers
    ORDER BY soul_contract_id, tx_date;
  `;

  // 4) Warm up and measure
  await client.query(sql);
  const t0 = performance.now();
  const res = await client.query(sql);
  const t1 = performance.now();

  console.table(res.rows);
  console.log(
    `✅ [DSQL] fetched ${res.rowCount} rows in ${(t1 - t0).toFixed(
      2
    )} ms`
  );

  await client.end();
}

analyticsDsql().catch((err) => {
  console.error("❌ DSQL analytics failed:", err);
  process.exit(1);
});
