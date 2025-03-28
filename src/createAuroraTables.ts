import { Client } from "pg";
import { CloudFormationCustomResourceHandler, CloudFormationCustomResourceResponse } from "aws-lambda";
import { performance } from "perf_hooks";
import { formatUrl } from "@aws-sdk/util-format-url";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS } from "@smithy/config-resolver";
import { Hash } from "@smithy/hash-node";
import { loadConfig } from "@smithy/node-config-provider";

// Utility: Get AWS runtime configuration.
const getRuntimeConfig = (config?: any): any => ({
  runtime: "node",
  sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
  credentials: config?.credentials ?? fromNodeProviderChain(),
  region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
  ...config,
});

// Signer: generates a temporary IAM token for Aurora DSQL.
class Signer {
  credentials: any;
  hostname: string;
  region: string;
  sha256: any;
  service: string;
  protocol: string;

  constructor(hostname: string) {
    const runtimeConfig = getRuntimeConfig({});
    this.credentials = runtimeConfig.credentials;
    this.hostname = hostname;
    this.region = runtimeConfig.region;
    this.sha256 = runtimeConfig.sha256;
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
    // RDS requires removal of the "https://" scheme.
    return formatUrl(presigned).replace(`${this.protocol}//`, "");
  }
}

/**
 * CloudFormation Custom Resource Handler to create Aurora DSQL tables.
 * This function is triggered during a CloudFormation Create (and optionally Update) event,
 * and it creates the necessary tables:
 *
 * - soul_contracts
 * - soul_contract_events
 * - soul_ledger
 *
 * On Delete events, it drops these tables.
 */
export const handler: CloudFormationCustomResourceHandler = async (event) => {
  console.log("Received CloudFormation event:", JSON.stringify(event));
  
  // Retrieve the connection string from the environment variable.
  const connectionString = process.env.DSQL_ENDPOINT;
  if (!connectionString) {
    throw new Error("Missing DSQL_ENDPOINT environment variable");
  }
  
  // Extract hostname from the connection string.
  // Assume the connection string is in the form:
  // postgres://admin:password@hostname:5432/postgres
  const hostnameMatch = connectionString.match(/@([^:\/]+)/);
  if (!hostnameMatch) {
    throw new Error("Could not parse hostname from DSQL_ENDPOINT");
  }
  const hostname = hostnameMatch[1];

  // Generate an IAM token using our Signer.
  const signer = new Signer(hostname);
  const token = await signer.getAuthToken();
  
  // Replace the password in the connection string with the token.
  const secureConnectionString = connectionString.replace(
    /(postgres:\/\/[^:]+:)[^@]+(@.*)/,
    `$1${token}$2`
  );

  // Create a new PostgreSQL client.
  const client = new Client({
    connectionString: secureConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    const startConnect = performance.now();
    await client.connect();
    console.log(`[Aurora DSQL CR] Connected to Aurora DSQL`);
    const connectTime = performance.now() - startConnect;
    console.log(`[Aurora DSQL CR] Connection time: ${connectTime.toFixed(2)} ms`);
    
    if (event.RequestType === "Create" || event.RequestType === "Update") {
      // Create tables if they do not exist.
      const ddl = `
        CREATE TABLE IF NOT EXISTS soul_contracts (
          id VARCHAR PRIMARY KEY,
          contract_status VARCHAR,
          updated_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS soul_contract_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          soul_contract_id VARCHAR NOT NULL,
          event_time TIMESTAMP,
          description TEXT
        );
        CREATE TABLE IF NOT EXISTS soul_ledger (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          soul_contract_id VARCHAR NOT NULL,
          amount NUMERIC,
          transaction_time TIMESTAMP,
          description TEXT
        );
      `;
      const startDDL = performance.now();
      await client.query(ddl);
      const ddlTime = performance.now() - startDDL;
      console.log(`[Aurora DSQL CR] DDL executed in ${ddlTime.toFixed(2)} ms`);
    } else if (event.RequestType === "Delete") {
      // Optionally, drop tables on delete.
      const ddlDrop = `
        DROP TABLE IF EXISTS soul_ledger;
        DROP TABLE IF EXISTS soul_contract_events;
        DROP TABLE IF EXISTS soul_contracts;
      `;
      await client.query(ddlDrop);
      console.log("[Aurora DSQL CR] Tables dropped successfully.");
    }
    
    await client.end();
    
    // Build a CloudFormation custom resource response.
    const response: CloudFormationCustomResourceResponse = {
      Status: "SUCCESS",
      Reason: "Tables created successfully.",
      PhysicalResourceId: event.PhysicalResourceId || "AuroraTablesResource",
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {}
    };
    console.log("CloudFormation response:", JSON.stringify(response));
    return response;
    
  } catch (err: any) {
    console.error("[Aurora DSQL CR] Error creating tables:", err);
    await client.end();
    const response: CloudFormationCustomResourceResponse = {
      Status: "FAILED",
      Reason: err.message,
      PhysicalResourceId: event.PhysicalResourceId || "AuroraTablesResource",
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {}
    };
    return response;
  }
};