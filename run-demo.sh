#!/usr/bin/env bash
set -euo pipefail

# ANSI colors
GREEN="\e[32m"
YELLOW="\e[33m"
CYAN="\e[36m"
RESET="\e[0m"

# Pause helper
pause() {
  echo
  read -p "$(printf "${YELLOW}▶ Press Enter to continue...${RESET}")" _
  echo
}

# Ensure required ENV vars
require_env() {
  local var=$1 prompt=$2 default=$3
  if [ -z "${!var:-}" ]; then
    read -p "$(printf "${CYAN}${prompt}${RESET} [${default}]: ")" val
    export $var="${val:-$default}"
  fi
}

clear
echo -e "${GREEN}🐐 Devil You NoSQL Interactive Demo${RESET}"
echo
echo -e "This demo will step through:"
echo -e "  1) measureDynamo.js"
echo -e "  2) measureDsql.js"
echo -e "  3) analyticsDynamo.js"
echo -e "  4) analyticsDsql.js"
echo
pause

# Prompt for ENV if needed
require_env AWS_REGION     "AWS Region"             "us-east-1"
require_env TABLE_NAME     "DynamoDB TableName"     "DevilSoulTracker"
require_env DSQL_ENDPOINT  "Aurora DSQL Endpoint"   ""
echo -e "${GREEN}✔ AWS_REGION=$AWS_REGION${RESET}"
echo -e "${GREEN}✔ TABLE_NAME=$TABLE_NAME${RESET}"
echo -e "${GREEN}✔ DSQL_ENDPOINT=$DSQL_ENDPOINT${RESET}"
pause

# 1) measureDynamo.js
echo -e "${CYAN}Step 1: measureDynamo.js → measures pure DynamoDB lookup latency${RESET}"
echo -e "${YELLOW}Here's the core of measureDynamo.js:${RESET}"
cat <<'EOF'
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { performance } = require("perf_hooks");

async function measureDynamo(soulId) {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  const params = {
    TableName: process.env.TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :ledger)",
    ExpressionAttributeValues: {
      ":pk":     { S: `SOUL#${soulId}` },
      ":ledger": { S: "LEDGER#" }
    }
  };
  const t0 = performance.now();
  const res = await client.send(new QueryCommand(params));
  const t1 = performance.now();
  console.log(`✅ DynamoDB: fetched ${res.Count} items in ${(t1 - t0).toFixed(2)} ms`);
}
EOF
echo
echo -e "This will query all ledger items for one soul by partition key, timing just the QueryCommand."
pause
node scripts/measureDynamo.js
pause

# 2) measureDsql.js
echo -e "${CYAN}Step 2: measureDsql.js → measures pure Aurora DSQL lookup latency${RESET}"
echo -e "${YELLOW}Here's the core of measureDsql.js:${RESET}"
cat <<'EOF'
const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client }     = require("pg");
const { performance } = require("perf_hooks");

async function measureDSQL(soulId) {
  const signer = new DsqlSigner({ hostname: process.env.DSQL_ENDPOINT, region: process.env.AWS_REGION });
  const token  = await signer.getDbConnectAdminAuthToken();
  const client = new Client({ host: process.env.DSQL_ENDPOINT, user: "admin", database: "postgres", password: token, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = `
    SELECT id, amount, transaction_time 
      FROM soul_ledger
     WHERE soul_contract_id = $1
  `;
  const t0 = performance.now();
  const res = await client.query(sql, [soulId]);
  const t1 = performance.now();
  console.log(`✅ Aurora DSQL: fetched ${res.rowCount} rows in ${(t1 - t0).toFixed(2)} ms`);
  await client.end();
}
EOF
echo
echo -e "This connects with an IAM token, runs a single SELECT, and measures just the query execution."
pause
node scripts/measureDsql.js
pause

# 3) analyticsDynamo.js
echo -e "${CYAN}Step 3: analyticsDynamo.js → client-side daily totals & running total & rank${RESET}"
echo -e "${YELLOW}Key snippet from analyticsDynamo.js:${RESET}"
cat <<'EOF'
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
// ...
// after fetching Items:
const entries = Items.map(item => ({
  date:   item.transaction_time.S.split("T")[0],
  amount: parseFloat(item.amount.N),
}));
const dailyMap = {};
entries.forEach(({date,amount}) => { dailyMap[date]=(dailyMap[date]||0)+amount; });
// build days[], sort by date, then:
// running total:
let run=0;
days.forEach(d => { run+=d.daily_amount; d.running_total=run; });
// day_rank:
const sorted = [...days].sort((a,b)=>b.daily_amount-a.daily_amount);
days.forEach(d => d.day_rank = sorted.findIndex(x=>x.tx_date===d.tx_date)+1);
console.table(days);
EOF
echo
echo -e "This script does all grouping, summing, windowing, and ranking in JavaScript."
pause
node scripts/analyticsDynamo.js
pause

# 4) analyticsDsql.js
echo -e "${CYAN}Step 4: analyticsDsql.js → server-side CTE + window functions${RESET}"
echo -e "${YELLOW}The single SQL it runs:${RESET}"
cat <<'EOF'
WITH daily_ledgers AS (
  SELECT soul_contract_id,
         transaction_time::date AS tx_date,
         SUM(amount) AS daily_amount
    FROM soul_ledger
   GROUP BY soul_contract_id, tx_date
)
SELECT
  soul_contract_id,
  tx_date,
  daily_amount,
  SUM(daily_amount) OVER (
    PARTITION BY soul_contract_id
    ORDER BY tx_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total,
  RANK() OVER (
    PARTITION BY soul_contract_id
    ORDER BY daily_amount DESC
  ) AS day_rank
FROM daily_ledgers
ORDER BY soul_contract_id, tx_date;
EOF
echo
echo -e "All aggregation and windowing happen inside Aurora DSQL in one shot."
pause
node scripts/analyticsDsql.js
pause

echo -e "${GREEN}🎉  Interactive demo complete!${RESET}"
