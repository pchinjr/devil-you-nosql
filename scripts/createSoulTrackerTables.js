/**
 * createSoulTrackerTables.js
 *
 * This script connects to your Aurora DSQL cluster using IAM authentication and creates
 * the necessary tables for the Soul Tracker application:
 *
 *   - soul_contracts
 *   - soul_contract_events
 *   - soul_ledger
 *
 * Requirements:
 *   - Environment variable DSQL_ENDPOINT must be set (e.g., cluster-abc123.dsql.us-east-1.on.aws)
 *   - Optionally, set AWS_REGION (defaults to us-east-1)
 *
 * Usage:
 *   node createSoulTrackerTables.js
 */

const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client } = require("pg");
const { performance } = require("perf_hooks");

// Read environment variables
const dsqlEndpoint = process.env.DSQL_ENDPOINT;
const region = process.env.AWS_REGION || "us-east-1";

if (!dsqlEndpoint) {
  console.error("Error: Please set the DSQL_ENDPOINT environment variable.");
  process.exit(1);
}

console.log(`Using Aurora DSQL endpoint: ${dsqlEndpoint} in region: ${region}`);

/**
 * generateToken - Generates an IAM authentication token for Aurora DSQL.
 * @param {string} endpoint - The Aurora DSQL endpoint.
 * @param {string} region - The AWS region.
 * @returns {Promise<string>} A promise that resolves to the generated IAM token.
 */
async function generateToken(endpoint, region) {
  // Initialize DsqlSigner with the given endpoint and region
  const signer = new DsqlSigner({ hostname: endpoint, region });
  try {
    // For the admin user, use getDbConnectAdminAuthToken.
    const token = await signer.getDbConnectAdminAuthToken();
    console.log("Generated IAM token (length):", token.length);
    return token;
  } catch (error) {
    console.error("Failed to generate token:", error);
    throw error;
  }
}

/**
 * createTables - Connects to Aurora DSQL and creates the necessary tables.
 * @param {string} token - The IAM authentication token.
 * @param {string} endpoint - The Aurora DSQL endpoint.
 * @returns {Promise<number>} 0 if successful, or 1 if an error occurred.
 */
async function createTables(token, endpoint) {
  // Construct the connection string using the IAM token as the password.
  // The expected format is: postgres://admin:<token>@<endpoint>:5432/postgres
  const connectionString = `postgres://admin:${token}@${endpoint}:5432/postgres`;
  console.log(`Using connection string: postgres://admin:***@${endpoint}:5432/postgres`);

  // Create a new PostgreSQL client.
  const client = new Client({
    user: "admin",
    database: "postgres",
    host: endpoint,
    password: token,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Connect to the database and measure connection time.
  console.log("Connecting to Aurora DSQL...");
  const startConnect = performance.now();
  await client.connect();
  const connectTime = performance.now() - startConnect;
  console.log(`Connected in ${connectTime.toFixed(2)} ms`);

  try {
    // DDL statement for creating the soul_contracts table.
    const ddlSoulContracts = `
      CREATE TABLE IF NOT EXISTS soul_contracts (
        id VARCHAR PRIMARY KEY,
        contract_status VARCHAR,
        soul_type VARCHAR,
        contract_location VARCHAR,
        updated_at TIMESTAMP
      );
    `;
    console.log("Creating table: soul_contracts...");
    const startDDL1 = performance.now();
    await client.query(ddlSoulContracts);
    const timeDDL1 = performance.now() - startDDL1;
    console.log(`soul_contracts created in ${timeDDL1.toFixed(2)} ms`);

    // DDL statement for creating the soul_contract_events table.
    const ddlSoulContractEvents = `
      CREATE TABLE IF NOT EXISTS soul_contract_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        soul_contract_id VARCHAR NOT NULL,
        event_time TIMESTAMP,
        description TEXT
      );
    `;
    console.log("Creating table: soul_contract_events...");
    const startDDL2 = performance.now();
    await client.query(ddlSoulContractEvents);
    const timeDDL2 = performance.now() - startDDL2;
    console.log(`soul_contract_events created in ${timeDDL2.toFixed(2)} ms`);

    // DDL statement for creating the soul_ledger table.
    const ddlSoulLedger = `
      CREATE TABLE IF NOT EXISTS soul_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        soul_contract_id VARCHAR NOT NULL,
        amount NUMERIC,
        transaction_time TIMESTAMP,
        description TEXT
      );
    `;
    console.log("Creating table: soul_ledger...");
    const startDDL3 = performance.now();
    await client.query(ddlSoulLedger);
    const timeDDL3 = performance.now() - startDDL3;
    console.log(`soul_ledger created in ${timeDDL3.toFixed(2)} ms`);

    console.log("All tables created successfully.");
    await client.end();
    return 0;
  } catch (error) {
    console.error("Error creating tables:", error);
    await client.end();
    return 1;
  }
}

/**
 * Main function:
 *  - Generates the IAM token.
 *  - Connects to Aurora DSQL and creates necessary tables.
 */
async function main() {
  try {
    const token = await generateToken(dsqlEndpoint, region);
    const result = await createTables(token, dsqlEndpoint);
    process.exit(result);
  } catch (error) {
    console.error("Error in main:", error);
    process.exit(1);
  }
}

main();
