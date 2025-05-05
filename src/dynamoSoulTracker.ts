// src/dynamoSoulTracker.ts
import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { performance } from "perf_hooks";

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.TABLE_NAME || "DevilSoulTracker";

/*
  In our single-table design:
  - The soul contract record has:
      PK = `SOUL#{soulId}`
      SK = "CONTRACT"
  - An event record has:
      PK = `SOUL#{soulId}`
      SK = `EVENT#{uuid}`
  - A ledger record has:
      PK = `SOUL#{soulId}`
      SK = `LEDGER#{uuid}`
*/

export const handler: APIGatewayProxyHandler = async (event, _context) => {
  const startTime = performance.now();
  console.log("🔥 [Single Table] Soul Tracker invoked at", new Date().toISOString());

  // Parse path and remove "dynamo" prefix if present.
  const pathParts = event.path.split('/').filter(Boolean);
  if (pathParts[0].toLowerCase() === "dynamo") {
    pathParts.shift();
  }
  // Our base route should now start with "souls"
  if (pathParts[0] !== "souls") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unsupported route" }),
    };
  }
  
  // In this example, we assume a POST operation to manage a soul contract update.
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unsupported method" }),
    };
  }
  
  if (!event.body) {
    return { statusCode: 400, body: "Missing request body" };
  }
  
  const { soulId, newStatus, amount } = JSON.parse(event.body);
  if (!soulId || !newStatus || amount === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing soulId, newStatus, or amount in request" }),
    };
  }
  
  // Build keys for the single table design.
  const contractPK = `SOUL#${soulId}`;
  const contractSK = "CONTRACT";
  const eventSK = `EVENT#${uuidv4()}`;
  const ledgerSK = `LEDGER#${uuidv4()}`;
  
  const params = {
    TransactItems: [
      {
        // Update the soul contract record.
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: contractPK, SK: contractSK },
          UpdateExpression: "SET #status = :newStatus, #updated = :now",
          ExpressionAttributeNames: {
            "#status": "contract_status",
            "#updated": "updated_at"
          },
          ExpressionAttributeValues: {
            ":newStatus": newStatus,
            ":now": new Date().toISOString()
          }
        }
      },
      {
        // Insert a contract event record.
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: contractPK,
            SK: eventSK,
            event_time: new Date().toISOString(),
            description: `Contract updated to '${newStatus}'`
          }
        }
      },
      {
        // Insert a ledger record.
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: contractPK,
            SK: ledgerSK,
            amount: amount,
            transaction_time: new Date().toISOString(),
            description: `Financial transaction for contract update: ${newStatus}`
          }
        }
      }
    ]
  };

  try {
    await docClient.send(new TransactWriteCommand(params));
    const endTime = performance.now();
    console.log(`[Single Table] Transaction completed in ${(endTime - startTime).toFixed(2)} ms`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Soul contract updated, event logged, and ledger entry recorded" }),
    };
  } catch (err: any) {
    const endTime = performance.now();
    console.error(`[Single Table] Transaction failed after ${(endTime - startTime).toFixed(2)} ms:`, err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
