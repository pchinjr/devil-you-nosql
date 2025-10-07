// scripts/seedDynamoSmall.js
// Seed 10 souls with 100 events & 100 ledger entries each into DynamoDB.

const { DynamoDBClient, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");

const REGION = "us-east-1";
const TABLE  = "DevilSoulTracker"; // adjust if yours is named differently

const client = new DynamoDBClient({ region: REGION });

/**
 * Split an array into chunks of size n.
 */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) {
    out.push(arr.slice(i, i + n));
  }
  return out;
}

async function seed() {
  const allRequests = [];
  const baseTime = new Date('2024-01-01T00:00:00Z');

  for (let i = 1; i <= 10; i++) {
    const id = `soul-${String(i).padStart(3, "0")}`;
    const pk = `SOUL#${id}`;
    const now = new Date(baseTime.getTime() + i * 1000).toISOString();

    // 1) Master contract item
    allRequests.push({
      PutRequest: {
        Item: {
          PK: { S: pk },
          SK: { S: "CONTRACT" },
          contract_status: { S: "Under Contract" },
          updated_at: { S: now }
        }
      }
    });

    // 2) 100 events
    for (let j = 0; j < 100; j++) {
      const eventTime = new Date(baseTime.getTime() + i * 1000 + j * 60000).toISOString();
      allRequests.push({
        PutRequest: {
          Item: {
            PK: { S: pk },
            SK: { S: `EVENT#${eventTime}` },
            event_time: { S: eventTime },
            description: { S: `Event #${j + 1} for ${id}` }
          }
        }
      });
    }

    // 3) 100 ledger entries
    for (let j = 0; j < 100; j++) {
      const txTime = new Date(baseTime.getTime() + i * 2000 + j * 90000).toISOString();
      const amount = ((i * 100 + j) % 100).toFixed(2);
      allRequests.push({
        PutRequest: {
          Item: {
            PK: { S: pk },
            SK: { S: `LEDGER#${txTime}` },
            transaction_time: { S: txTime },
            amount: { N: amount },
            description: { S: `Charge #${j + 1} for ${id}` }
          }
        }
      });
    }
  }

  // BatchWrite in chunks of 25
  const batches = chunk(allRequests, 25);
  console.log(`🔨 Writing ${allRequests.length} items in ${batches.length} batches…`);
  for (let idx = 0; idx < batches.length; idx++) {
    const req = { RequestItems: { [TABLE]: batches[idx] } };
    await client.send(new BatchWriteItemCommand(req));
    process.stdout.write(` Batch ${idx + 1}/${batches.length}…`);
  }
  console.log("\n✅ DynamoDB seeding complete!");
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
