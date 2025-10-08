// scripts/analyticsDynamo.js
/**
 * Analytics in Node for DynamoDB “soul_ledger” entries:
 *  1) Query each soul’s ledger items.
 *  2) Roll up daily totals.
 *  3) Compute running total.
 *  4) Rank days by amount.
 */

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { performance } = require("perf_hooks");

async function analyticsDynamo() {
  const client = new DynamoDBClient({ region: "us-east-1" });
  const soulIds = Array.from({ length: 10 }, (_, i) =>
    `soul-${String(i + 1).padStart(3, "0")}`
  );

  const results = [];

  for (const soulId of soulIds) {
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

    // Fetch all ledger entries for this soul
    const t0 = performance.now();
    const { Items } = await client.send(new QueryCommand(params));
    const t1 = performance.now();
    console.log(
      `✅ [Dynamo] ${soulId}: fetched ${Items.length} items in ${(
        t1 - t0
      ).toFixed(2)} ms`
    );

    // Transform into simple { date, amount }
    const entries = Items.map(({ transaction_time, amount }) => ({
      date:   transaction_time.S.split("T")[0],
      amount: parseFloat(amount.N),
    }));

    // 1) Daily totals
    const dailyMap = {};
    for (const { date, amount } of entries) {
      dailyMap[date] = (dailyMap[date] || 0) + amount;
    }
    let days = Object.entries(dailyMap).map(([tx_date, daily_amount]) => ({
      soul_contract_id: soulId,
      tx_date,
      daily_amount,
    }));
    days.sort((a, b) => new Date(a.tx_date) - new Date(b.tx_date));

    // 2) Running total
    let running = 0;
    for (const d of days) {
      running += d.daily_amount;
      d.running_total = running;
    }

    // 3) Day rank by daily_amount
    const sortedByAmt = [...days].sort(
      (a, b) => b.daily_amount - a.daily_amount
    );
    days = days.map((d) => {
      const rank =
        sortedByAmt.findIndex((x) => x.tx_date === d.tx_date) + 1;
      return { ...d, day_rank: rank };
    });

    results.push(...days);
  }

  console.table(results);
}

analyticsDynamo().catch((err) => {
  console.error("❌ Dynamo analytics failed:", err);
  process.exit(1);
});
