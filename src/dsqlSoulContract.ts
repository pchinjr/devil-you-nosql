import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Client } from "pg";
import { APIGatewayProxyHandler } from "aws-lambda";
import { performance } from "perf_hooks";

// This lambda is accessible via the /dsql/souls route.
export const handler: APIGatewayProxyHandler = async (event, _context) => {
  const overallStart = performance.now();
  console.log("🔥 [Aurora DSQL] Managing soul contract at", new Date().toISOString());

  // Expecting a POST request with the following JSON payload:
  // { "soulContractId": "soul-001", "newStatus": "Released", "amount": 150, "endpoint": "your_cluster_endpoint" }
  if (event.httpMethod !== "POST" || !event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Only POST with a valid payload is supported" }),
    };
  }

  const { soulContractId, newStatus, amount, endpoint } = JSON.parse(event.body);
  if (!soulContractId || !newStatus || amount === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing soulContractId, newStatus, or amount" }),
    };
  }

  // Use the endpoint from the payload, or fallback to an environment variable.
  const dbEndpoint = endpoint || process.env.DSQL_ENDPOINT;
  if (!dbEndpoint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing Aurora DSQL endpoint" }),
    };
  }
  console.log(`Using Aurora DSQL endpoint: ${dbEndpoint}`);

  // Retrieve the AWS region
  const region = process.env.AWS_REGION || "us-east-1";

  // Generate an IAM token using the DsqlSigner.
  const signer = new DsqlSigner({ hostname: dbEndpoint, region });
  let token: string;
  try {
    // Generate the token for the admin role.
    token = await signer.getDbConnectAdminAuthToken();
    console.log("Generated IAM token (length):", token.length);
  } catch (err) {
    console.error("Failed to generate IAM token:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate token" }),
    };
  }

  // Create a new PostgreSQL client using the provided connection object.
  const client = new Client({
    user: "admin",
    database: "postgres",
    host: dbEndpoint,
    password: token,
    ssl: {
      rejectUnauthorized: false
    },
  });

  try {
    console.log("Connecting to Aurora DSQL...");
    const tConnectStart = performance.now();
    await client.connect();
    const tConnect = performance.now() - tConnectStart;
    console.log(`Connected in ${tConnect.toFixed(2)} ms`);

    // Begin a transaction.
    await client.query("BEGIN;");

    // Update the soul contract in the 'soul_contracts' table.
    const updateQuery = `
      UPDATE soul_contracts 
      SET contract_status = $1, updated_at = NOW() 
      WHERE id = $2;
    `;
    await client.query(updateQuery, [newStatus, soulContractId]);
    console.log("Soul contract updated.");

    // Insert an event into the 'soul_contract_events' table.
    const eventQuery = `
      INSERT INTO soul_contract_events (id, soul_contract_id, event_time, description)
      VALUES (gen_random_uuid(), $1, NOW(), $2);
    `;
    await client.query(eventQuery, [soulContractId, `Contract updated to '${newStatus}'`]);
    console.log("Soul contract event logged.");

    // Insert a ledger entry into the 'soul_ledger' table.
    const ledgerQuery = `
      INSERT INTO soul_ledger (id, soul_contract_id, amount, transaction_time, description)
      VALUES (gen_random_uuid(), $1, $2, NOW(), $3);
    `;
    await client.query(ledgerQuery, [soulContractId, amount, `Financial transaction for contract update: ${newStatus}`]);
    console.log("Soul ledger entry recorded.");

    // Commit the transaction.
    await client.query("COMMIT;");
    console.log("Transaction committed successfully.");

    const overallTime = performance.now() - overallStart;
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Soul contract managed successfully",
        executionTimeMs: overallTime.toFixed(2)
      })
    };
  } catch (err: any) {
    console.error("Transaction error:", err);
    try {
      await client.query("ROLLBACK;");
    } catch (rollbackErr) {
      console.error("Rollback error:", rollbackErr);
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  } finally {
    await client.end();
  }
};
