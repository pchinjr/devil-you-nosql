/**
 * verifyDsql.js
 *
 * This script verifies connectivity to your Aurora DSQL cluster by:
 *  - Generating an IAM authentication token using DsqlSigner.
 *  - Creating a PostgreSQL client with the provided connection object.
 *  - Creating a test table (non-temporary, as TEMP tables are not supported).
 *  - Inserting a test row and reading it back.
 *  - Dropping the test table.
 *
 * Prerequisites:
 *  - Environment variable DSQL_ENDPOINT must be set (e.g., cluster-abc123.dsql.us-east-1.on.aws)
 *  - Optionally, AWS_REGION (defaults to us-east-1)
 *
 * Usage:
 *  node verifyDsql.js
 */

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client } = require("pg");
const { performance } = require("perf_hooks");

const dsqlEndpoint = process.env.DSQL_ENDPOINT;
const region = process.env.AWS_REGION || "us-east-1";

if (!dsqlEndpoint) {
  console.error("Error: Please set the DSQL_ENDPOINT environment variable.");
  process.exit(1);
}

console.log(`Using Aurora DSQL endpoint: ${dsqlEndpoint} in region: ${region}`);

async function generateToken(endpoint, region) {
  const signer = new DsqlSigner({ hostname: endpoint, region });
  try {
    // Use getDbConnectAdminAuthToken() for the admin role.
    const token = await signer.getDbConnectAdminAuthToken();
    console.log("Generated IAM token (length):", token.length);
    return token;
  } catch (error) {
    console.error("Failed to generate token:", error);
    throw error;
  }
}

async function verifyDSQL(token, endpoint) {
  // Create a new PostgreSQL client using your provided object.
  const client = new Client({
    user: "admin",
    database: "postgres",
    host: endpoint,
    password: token,
    ssl: {
      rejectUnauthorized: false
    }
  });

  console.log("Connecting to Aurora DSQL...");
  const tConnectStart = performance.now();
  await client.connect();
  const tConnect = performance.now() - tConnectStart;
  console.log(`Connected in ${tConnect.toFixed(2)} ms`);

  try {
    // Drop the test table if it exists
    await client.query("DROP TABLE IF EXISTS test_table;");
    console.log("Dropped existing test_table if any.");

    // Create a test table (non-temporary, because TEMP tables aren't supported)
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS test_table (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    console.log("Creating test_table...");
    const tDDLStart = performance.now();
    await client.query(createTableQuery);
    const tDDL = performance.now() - tDDLStart;
    console.log(`test_table created in ${tDDL.toFixed(2)} ms`);

    // Insert a test record.
    const insertQuery = `
      INSERT INTO test_table(message) VALUES($1) RETURNING id, message, created_at;
    `;
    const insertRes = await client.query(insertQuery, ["Hello, Aurora DSQL!"]);
    console.log("Inserted test row:", insertRes.rows[0]);

    // Select the test record.
    const selectQuery = `SELECT * FROM test_table WHERE id = $1;`;
    const selectRes = await client.query(selectQuery, [insertRes.rows[0].id]);
    console.log("Retrieved row:", selectRes.rows[0]);

    // Drop the test table to clean up.
    await client.query("DROP TABLE IF EXISTS test_table;");
    console.log("Dropped test_table.");
    
    return 200;
  } catch (err) {
    console.error("Transaction error:", err);
    return 500;
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    const token = await generateToken(dsqlEndpoint, region);
    const resultCode = await verifyDSQL(token, dsqlEndpoint);
    if (resultCode === 200) {
      console.log("Aurora DSQL verification succeeded.");
    } else {
      console.error("Aurora DSQL verification failed.");
    }
    process.exit(resultCode);
  } catch (error) {
    console.error("Verification error:", error);
    process.exit(1);
  }
}

main();
