// src/dsqlSoulContract.ts

import "dotenv/config";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Client } from "pg";
import { APIGatewayProxyHandler } from "aws-lambda";
import { performance } from "perf_hooks";

// —————————————————————————————————————————————————————————————
// POST /dsql/souls
// Body: {
//   soulContractId: string,
//   newStatus: string,
//   amount: number,
//   endpoint?: string
// }
// Demo theme: Ghost Rider making deals with the devil.
// —————————————————————————————————————————————————————————————
export const handler: APIGatewayProxyHandler = async (event) => {
  const startAll = performance.now();
  console.log("🔥 [Ghost Rider] Soul-contract invocation at", new Date().toISOString());

  // 1) Validate & parse
  if (event.httpMethod !== "POST" || !event.body) {
    return { statusCode: 400, body: "Only POST with JSON body is supported" };
  }
  let body: any;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  const { soulContractId, newStatus, amount, endpoint } = body;
  if (!soulContractId || !newStatus || typeof amount !== "number") {
    return { statusCode: 400, body: "Missing soulContractId, newStatus, or amount" };
  }

  // 2) Determine DSQL endpoint
  const dbEndpoint = endpoint || process.env.DSQL_ENDPOINT;
  if (!dbEndpoint) {
    return { statusCode: 400, body: "Missing DSQL endpoint" };
  }
  console.log(`👹 [Devil’s Endpoint] ${dbEndpoint}`);

  // 3) Generate IAM token
  const region = process.env.AWS_REGION || "us-east-1";
  const signer = new DsqlSigner({ hostname: dbEndpoint, region });
  let token: string;
  try {
    token = await signer.getDbConnectAdminAuthToken();
  } catch (err) {
    console.error("❌ Token generation failed:", err);
    return { statusCode: 500, body: "Failed to generate auth token" };
  }

  // 4) Connect to DSQL
  const client = new Client({
    host: dbEndpoint,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("⛓️  Connecting to Aurora DSQL…");
    const t0 = performance.now();
    await client.connect();
    console.log(`⛓️  Connected in ${(performance.now() - t0).toFixed(1)} ms`);

    // 5) Begin transaction
    await client.query("BEGIN;");

    // 5a) Upsert the master soul_contract
    console.log(`📝 Upserting soul_contract '${soulContractId}'…`);
    await client.query(
      `INSERT INTO soul_contracts(id, contract_status, updated_at)
         VALUES($1, $2, NOW())
         ON CONFLICT(id) DO UPDATE
           SET contract_status = EXCLUDED.contract_status,
               updated_at      = EXCLUDED.updated_at;`,
      [soulContractId, newStatus]
    );

    // 5b) Log the contract event
    console.log(`🗒  Logging event for '${soulContractId}'…`);
    await client.query(
      `INSERT INTO soul_contract_events(id, soul_contract_id, event_time, description)
         VALUES(gen_random_uuid(), $1, NOW(), $2);`,
      [soulContractId, `Contract updated to '${newStatus}'`]
    );

    // 5c) Record the ledger entry
    console.log(`💰 Recording ledger entry for '${soulContractId}'…`);
    await client.query(
      `INSERT INTO soul_ledger(id, soul_contract_id, amount, transaction_time, description)
         VALUES(gen_random_uuid(), $1, $2, NOW(), $3);`,
      [soulContractId, amount, `Financial transaction: ${newStatus}`]
    );

    // 6) Commit
    await client.query("COMMIT;");
    const totalMs = (performance.now() - startAll).toFixed(1);
    console.log(`✅ Transaction committed in ${totalMs} ms`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "🔥 Soul contract processed by Ghost Rider!",
        soulContractId,
        executionMs: totalMs
      }),
    };
  } catch (err: any) {
    console.error("❌ Transaction failed—rolling back:", err);
    try { await client.query("ROLLBACK;"); } catch {}
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  } finally {
    await client.end();
  }
};
