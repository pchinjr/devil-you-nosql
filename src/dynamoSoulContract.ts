import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { performance } from "perf_hooks";

// Use the region from the environment.
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.TABLE_NAME || "DevilSoulTracker";

/**
 * DynamoDB-based soul contract management.
 *
 * This Lambda function performs the following steps:
 * 1. Updates the soul contract record (with partition key "CONTRACT#<contractId>")
 * 2. Inserts a contract event record with a sort key of "EVENT#<uuid>"
 * 3. Inserts a ledger entry record with a sort key of "LEDGER#<uuid>"
 *
 * All operations are executed atomically via TransactWriteItems.
 */
export const handler: APIGatewayProxyHandler = async (event, _context) => {
  const startTime = performance.now();
  console.log("🔥 [DynamoDB] Managing soul contract at", new Date().toISOString());

  // Expected API route: /dynamo/souls, so remove the "dynamo" prefix.
  const pathParts = event.path.split("/").filter(Boolean);
  if (pathParts[0].toLowerCase() === "dynamo") {
    pathParts.shift();
  }
  if (pathParts[0] !== "souls") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unsupported route" }),
    };
  }

  // Only accept POST requests.
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unsupported method" }),
    };
  }

  if (!event.body) {
    return { statusCode: 400, body: "Missing request body" };
  }

  // Extract parameters: soulContractId, newStatus, and amount.
  const { soulContractId, newStatus, amount } = JSON.parse(event.body);
  if (!soulContractId || !newStatus || amount === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing soulContractId, newStatus, or amount" }),
    };
  }

  // Build keys for our single table design.
  // Contract record: PK = "CONTRACT#<id>", SK = "METADATA"
  // Event record: PK = same as contract, SK = "EVENT#<uuid>"
  // Ledger record: PK = same as contract, SK = "LEDGER#<uuid>"
  const contractPK = `CONTRACT#${soulContractId}`;
  const contractSK = "METADATA";
  const eventSK = `EVENT#${uuidv4()}`;
  const ledgerSK = `LEDGER#${uuidv4()}`;

  // Prepare the transaction items.
  const params = {
    TransactItems: [
      {
        // Update the soul contract.
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: contractPK, SK: contractSK },
          UpdateExpression: "SET contract_status = :newStatus, updated_at = :now",
          ExpressionAttributeValues: {
            ":newStatus": newStatus,
            ":now": new Date().toISOString(),
          },
        },
      },
      {
        // Insert an event record.
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: contractPK,
            SK: eventSK,
            event_time: new Date().toISOString(),
            description: `Contract updated to '${newStatus}'`,
          },
        },
      },
      {
        // Insert a ledger record.
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: contractPK,
            SK: ledgerSK,
            amount,
            transaction_time: new Date().toISOString(),
            description: `Financial transaction for contract update: ${newStatus}`,
          },
        },
      },
    ],
  };

  try {
    await docClient.send(new TransactWriteCommand(params));
    const endTime = performance.now();
    console.log(`[DynamoDB] Transaction completed in ${(endTime - startTime).toFixed(2)} ms`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Soul contract updated successfully" }),
    };
  } catch (err: any) {
    const endTime = performance.now();
    console.error(`[DynamoDB] Transaction failed after ${(endTime - startTime).toFixed(2)} ms:`, err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
