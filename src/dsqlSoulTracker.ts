// src/dsqlSoulTracker.ts

import { formatUrl } from "@aws-sdk/util-format-url";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS } from "@smithy/config-resolver";
import { Hash } from "@smithy/hash-node";
import { loadConfig } from "@smithy/node-config-provider";
import { Client } from "pg";
import { APIGatewayProxyHandler } from "aws-lambda";
import { performance } from "perf_hooks";

// Define the expected event shape.
interface DsqlEvent {
  endpoint?: string;
  soulContractId: string;
  newStatus: string;
  amount: number;
}

// Utility to obtain runtime configuration.
export const getRuntimeConfig = (config?: any): any => {
  return {
    runtime: "node",
    sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
    credentials: config?.credentials ?? fromNodeProviderChain(),
    region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
    ...config,
  };
};

// The Signer class generates an IAM authentication token for Aurora DSQL.
export class Signer {
  credentials: any;
  hostname: string;
  region: string;
  sha256: any;
  service: string;
  protocol: string;

  constructor(hostname: string) {
    const runtimeConfiguration = getRuntimeConfig({});
    this.credentials = runtimeConfiguration.credentials;
    this.hostname = hostname;
    this.region = runtimeConfiguration.region;
    this.sha256 = runtimeConfiguration.sha256;
    this.service = "dsql";
    this.protocol = "https:";
  }
  
  async getAuthToken(): Promise<string> {
    const signer = new SignatureV4({
      service: this.service,
      region: this.region,
      credentials: this.credentials,
      sha256: this.sha256,
    });

    const request = new HttpRequest({
      method: "GET",
      protocol: this.protocol,
      hostname: this.hostname,
      query: { Action: "DbConnectAdmin" },
      headers: { host: this.hostname },
    });

    const presigned = await signer.presign(request, { expiresIn: 3600 });
    // RDS requires the scheme ("https://") to be removed.
    return formatUrl(presigned).replace(`${this.protocol}//`, "");
  }
}

/**
 * Executes a multi-statement transaction in Aurora DSQL to:
 *  1. Update the soul contract record in the `soul_contracts` table.
 *  2. Insert an event record into the `soul_contract_events` table.
 *  3. Insert a ledger record into the `soul_ledger` table.
 *
 * @param soulContractId - The unique ID of the soul contract.
 * @param newStatus - The updated contract status.
 * @param amount - The financial amount associated with the update.
 * @param endpoint - The Aurora DSQL cluster endpoint.
 * @returns HTTP status code 200 on success, 500 on failure.
 */
async function manageSoulContractAurora(
  soulContractId: string,
  newStatus: string,
  amount: number,
  endpoint: string
): Promise<number> {
  // Create a new PostgreSQL client.
  const client = new Client({
    user: "admin",
    database: "postgres",
    host: endpoint,
    password: "", // Will be set with the IAM-generated token.
    ssl: { rejectUnauthorized: false },
  });

  // Generate an IAM token and use it as the connection password.
  const signer = new Signer(endpoint);
  const token = await signer.getAuthToken();
  client.password = token;

  const startConnect = performance.now();
  await client.connect();
  const connectTime = performance.now() - startConnect;
  console.log(`[Aurora DSQL] Connected in ${connectTime.toFixed(2)} ms`);

  try {
    const startTxn = performance.now();
    await client.query("BEGIN;");
    
    // 1. Update the soul contract record.
    const updateQuery = `
      UPDATE soul_contracts
      SET contract_status = $1, updated_at = NOW()
      WHERE id = $2;
    `;
    await client.query(updateQuery, [newStatus, soulContractId]);

    // 2. Insert a contract event record.
    const eventQuery = `
      INSERT INTO soul_contract_events (id, soul_contract_id, event_time, description)
      VALUES (gen_random_uuid(), $1, NOW(), $2);
    `;
    await client.query(eventQuery, [soulContractId, `Contract updated to '${newStatus}'`]);

    // 3. Insert a ledger record.
    const ledgerQuery = `
      INSERT INTO soul_ledger (id, soul_contract_id, amount, transaction_time, description)
      VALUES (gen_random_uuid(), $1, $2, NOW(), $3);
    `;
    await client.query(ledgerQuery, [soulContractId, amount, `Financial transaction for contract update: ${newStatus}`]);

    await client.query("COMMIT;");
    const txnTime = performance.now() - startTxn;
    console.log(`[Aurora DSQL] Transaction executed in ${txnTime.toFixed(2)} ms`);
    return 200;
  } catch (err) {
    console.error("[Aurora DSQL] Transaction failed!", err);
    await client.query("ROLLBACK;");
    return 500;
  } finally {
    await client.end();
  }
}

/**
 * Lambda handler: Uses the endpoint from the event payload (if provided) or falls back to the environment variable.
 * Expects a payload containing: 
 *   - soulContractId (string)
 *   - newStatus (string)
 *   - amount (number)
 *   - (optional) endpoint (string)
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const overallStart = performance.now();

  // Extract endpoint: first try event body, then fallback to env variable.
  let endpoint: string | undefined;
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    endpoint = body?.endpoint;
  } catch (err) {}
  if (!endpoint) {
    endpoint = process.env.DSQL_ENDPOINT;
  }
  if (!endpoint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing 'endpoint' in event payload and no DSQL_ENDPOINT set" }),
    };
  }

  // Extract business parameters.
  let soulContractId: string, newStatus: string, amount: number;
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    soulContractId = body.soulContractId;
    newStatus = body.newStatus;
    amount = body.amount;
    if (!soulContractId || !newStatus || amount === undefined) {
      throw new Error("Missing required parameters");
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing soulContractId, newStatus, or amount in request" }),
    };
  }

  console.log("🔥 [Aurora DSQL] Managing soul contract for:", soulContractId);

  try {
    const responseCode = await manageSoulContractAurora(soulContractId, newStatus, amount, endpoint);
    const overallTime = performance.now() - overallStart;
    return {
      statusCode: responseCode,
      body: JSON.stringify({
        statusCode: responseCode,
        endpoint,
        executionTimeMs: overallTime.toFixed(2)
      })
    };
  } catch (err: any) {
    console.error("🔥 [Aurora DSQL] Error in handler:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, endpoint })
    };
  }
};
