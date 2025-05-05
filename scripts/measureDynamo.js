// scripts/measureDynamo.js
// Measure DynamoDB “LEDGER#” query latency for a given soulContractId.

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { performance } = require("perf_hooks");

async function measureDynamo(soulId) {
  const client = new DynamoDBClient({ region: "us-east-1" });
  const pk = `SOUL#${soulId}`;

  const params = {
    TableName: "DevilSoulTracker",
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :ledger)",
    ExpressionAttributeValues: {
      ":pk":     { S: pk },
      ":ledger": { S: "LEDGER#" }
    },
    ScanIndexForward: true
  };

  const t0 = performance.now();
  const result = await client.send(new QueryCommand(params));
  const t1 = performance.now();

  console.log(`✅ DynamoDB: fetched ${result.Count} items in ${(t1 - t0).toFixed(2)} ms`);
  return result.Items;
}

(async () => {
  try {
    await measureDynamo("soul-001");
  } catch (err) {
    console.error("❌ Error measuring DynamoDB:", err);
    process.exit(1);
  }
})();
