## The Devil You NoSQL

A proof-of-concept demonstrating two approaches for managing “soul contracts” in a Ghost Rider–themed application:

* **DynamoDB-based Soul Tracker** using a single-table design.
* **Aurora DSQL-based Soul Tracker** using IAM authentication and native SQL transactions.

This repo also includes scripts for schema bootstrapping, connectivity verification, data seeding, indexing, performance measurement, and analytics.
---

## Repository Structure

```
devil-you-nosql/
├── src/
│   ├── dynamoSoulTracker.ts            # DynamoDB-based Soul Tracker Lambda
│   └── dsqlSoulTracker.ts              # Aurora DSQL-based Soul Tracker Lambda
├── scripts/
│   ├── verifyDsql.js                   # Test DSQL connectivity (create/read/drop)
│   ├── createSoulTrackerTables.js      # Create soul-contract tables in Aurora DSQL
│   ├── seedDynamoSmall.js              # Seed DynamoDB (10 souls × 100 events + 100 ledger)
│   ├── seedDsqlSmall.js                # Seed Aurora DSQL (10 souls × 100 events + 100 ledger)
│   ├── seedLarge.js                    # Seed large datasets (configurable size)
│   ├── createDsqlIndexes.js            # Create ASYNC indexes on DSQL tables
│   ├── measureDynamo.js                # Measure pure DynamoDB lookup latency
│   ├── measureDsql.js                  # Measure pure Aurora DSQL lookup latency
│   ├── benchmark.js                    # Comprehensive performance benchmarking
│   ├── validate.js                     # Data consistency validation
│   ├── loadTest.js                     # Concurrent load testing
│   ├── runTests.js                     # Test suite orchestrator
│   ├── analyticsDynamo.js              # Client-side analytics (daily totals + window) on DynamoDB
│   └── analyticsDsql.js                # Single-SQL analytics (CTE + window functions) on Aurora DSQL
├── run-rigorous-demo.sh                # Comprehensive demo runner
├── template.yaml                       # SAM template for both Lambdas + DynamoDB table
├── package.json                        # Node.js dependencies & scripts
├── tsconfig.json                       # TypeScript configuration
└── README.md                           # This file
```

---

## Prerequisites

* **Node.js** v20+
* **AWS SAM CLI** ([Install Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))
* **AWS Credentials** (via CLI profile, ENV vars, or attached IAM role)
* **Aurora DSQL Cluster** (provisioned & note the endpoint)
* **Environment Variables** for local scripts:

  * `DSQL_ENDPOINT` – your Aurora DSQL cluster endpoint
  * `AWS_REGION` – AWS region (defaults to `us-east-1`)

---

## 1. Provision Aurora DSQL Cluster (Console)

1. **Open the Aurora DSQL Console**
   Sign in to the AWS Console and navigate to **Amazon Aurora DSQL**: [https://console.aws.amazon.com/dsql](https://console.aws.amazon.com/dsql) ([AWS Documentation][1])
2. **Create a Cluster**
   Click **Create cluster**, enter a name (and optional tags/deletion protection), then click **Create cluster**.
3. **Wait for ACTIVE status**
   On the **Clusters** page, wait until **Status** reads **ACTIVE** ([AWS Documentation][2]).
4. **Copy the Endpoint**
   Select your cluster and under **Connectivity**, copy the **Endpoint (Host)** (e.g., `abc123.dsql.us-east-1.on.aws`) ([AWS Documentation][1]).

---

## 2. Bootstrap Schema in CloudShell

Amazon CloudShell comes pre-installed with `psql` v14+, making it easy to run DDL without installing clients.

1. **Launch CloudShell**
   Click the **>\_ CloudShell** icon in the AWS Console header .
2. **Clone & Install**

   ```bash
   git clone https://github.com/your-org/devil-you-nosql.git
   cd devil-you-nosql
   npm install
   ```
3. **Create Tables**

   ```bash
   export DSQL_ENDPOINT=<your-cluster-endpoint>
   node scripts/createSoulTrackerTables.js
   ```

   This script issues `CREATE TABLE IF NOT EXISTS` for `soul_contracts`, `soul_contract_events`, and `soul_ledger`.

---

## 3. Deploy with AWS SAM

With your database ready, deploy both Lambdas and the DynamoDB table in one stack.

1. **Build**

   ```bash
   sam build --template-file template.yaml
   ```
2. **Deploy**

   ```bash
   sam deploy --guided --stack-name DevilYouNoSQLStack
   ```

   * **TableName**: DynamoDB table name (default `DevilSoulTracker`)
   * **DSQLEndpoint**: Aurora DSQL endpoint (paste your value)
3. **Post-Deploy**
   SAM outputs two API URLs:

   * `<DynamoApiUrl>/dynamo/souls`
   * `<AuroraApiUrl>/dsql/souls`

---

## 4. Testing Your APIs

Example `curl` commands (replace `<API_URL>` with SAM outputs):

```bash
curl -X POST <DynamoApiUrl>/dynamo/souls \
  -H "Content-Type: application/json" \
  -d '{"soulId":"soul-001","newStatus":"Released","amount":100}'

curl -X POST <AuroraApiUrl>/dsql/souls \
  -H "Content-Type: application/json" \
  -d '{
    "soulContractId":"soul-123",
    "newStatus":"Released",
    "amount":150,
    "endpoint":"abc123.dsql.us-east-1.on.aws"
}'
```

---

## 5. Utility Scripts

### Schema & Connectivity

* **verifyDsql.js**
  Verifies DSQL by creating/reading/dropping a test table.

  ```bash
  DSQL_ENDPOINT=… AWS_REGION=… node scripts/verifyDsql.js
  ```

* **createSoulTrackerTables.js**
  Creates the three soul-tracker tables in Aurora DSQL.

  ```bash
  DSQL_ENDPOINT=… node scripts/createSoulTrackerTables.js
  ```

### Data Seeding

* **seedDynamoSmall.js**
  Seeds DynamoDB (10 souls × 100 events + 100 ledger).
* **seedDsqlSmall.js**
  Seeds Aurora DSQL similarly.

  ```bash
  npm install @aws-sdk/client-dynamodb @aws-sdk/dsql-signer pg
  DSQL_ENDPOINT=… node scripts/seedDynamoSmall.js
  DSQL_ENDPOINT=… node scripts/seedDsqlSmall.js
  ```

### Index Management

* **createDsqlIndexes.js**
  Idempotently creates `CREATE INDEX ASYNC IF NOT EXISTS` on the DSQL tables.

  ```bash
  DSQL_ENDPOINT=… node scripts/createDsqlIndexes.js
  ```

### Performance Measurement

* **measureDynamo.js**
  Measures pure DynamoDB lookup latency.
* **measureDsql.js**
  Measures pure Aurora DSQL lookup latency.

  ```bash
  npm install @aws-sdk/client-dynamodb @aws-sdk/dsql-signer pg
  DSQL_ENDPOINT=… node scripts/measureDynamo.js
  DSQL_ENDPOINT=… node scripts/measureDsql.js
  ```

### Analytics Comparison

* **analyticsDynamo.js**
  Runs daily totals + running total + day-rank client-side on DynamoDB.
* **analyticsDsql.js**
  Runs the same analytics in one SQL (Common Table Expression (CTE) + window functions) on Aurora DSQL.

  ```bash
  npm install @aws-sdk/client-dynamodb @aws-sdk/dsql-signer pg
  DSQL_ENDPOINT=… node scripts/analyticsDynamo.js
  DSQL_ENDPOINT=… node scripts/analyticsDsql.js
  ```

---

## 6. Cleaning Up

```bash
sam delete --stack-name DevilYouNoSQLStack --region <your-region>
```

---

This repository illustrates both the **devil you know** (NoSQL agility) and the **devil you don’t** (relational power) in action—so you can choose the best tool for managing soul contracts in your next spectral saga.

## 7. Demo Findings & Trade-offs

### Foundational Concepts Demonstrated

This demo illustrates core AWS guidance on SQL vs NoSQL trade-offs through practical examples:

**Data Models in Action:**
- **DynamoDB**: Single-table design with composite keys (`PK=SOUL#soul-001`, `SK=LEDGER#uuid`) 
- **Aurora DSQL**: Normalized tables with foreign key relationships (`soul_contracts` → `soul_ledger`)

**Performance Characteristics:**
- **DynamoDB**: Compute-optimized, network latency dependent (sub-10ms partition key queries)
- **Aurora DSQL**: Storage-optimized, benefits from query optimization and indexing

**Scaling Patterns:**
- **DynamoDB**: Horizontal scaling through partitioning (seamless auto-scaling)
- **Aurora DSQL**: Serverless SQL processing with connection pooling

### Key Strengths Demonstrated

**DynamoDB Advantages:**
* **Predictable performance**: Sub-10ms key-based lookups at any scale
* **Simple transactions**: ACID guarantees within partition boundaries
* **Zero administration**: Fully managed with auto-scaling
* **Compute-optimized**: Performance driven by hardware/network, not disk I/O

**Aurora DSQL Advantages:**
* **Complex analytics**: Single SQL handles aggregations, window functions, CTEs
* **Relational queries**: Natural JOINs and complex WHERE clauses
* **Full ACID transactions**: BEGIN/COMMIT/ROLLBACK across multiple tables
* **Rich tooling**: Standard SQL with extensive query optimization capabilities

### Performance Patterns Observed

* **Point lookups**: DynamoDB excels with partition key queries
* **Analytical workloads**: DSQL processes complex aggregations server-side vs client-side JavaScript
* **Transaction overhead**: DSQL connection setup adds latency but enables richer operations
* **Scaling characteristics**: DynamoDB seamless auto-scaling vs DSQL's serverless SQL processing

### When to Choose Each

**Choose DynamoDB when:**
- Web-scale applications (social networks, gaming, IoT)
- Access patterns are key-based and predictable
- You need guaranteed single-digit millisecond latency
- Schema flexibility for JSON/semistructured data
- Operational simplicity is paramount

**Choose Aurora DSQL when:**
- Ad hoc queries and data warehousing needs
- Analytics and reporting are primary use cases
- Complex queries with JOINs are common
- Well-defined relational schema exists
- SQL expertise and tooling are important

---

## 8. Rigorous Testing & Benchmarking

This demo includes comprehensive testing suites to rigorously evaluate both DynamoDB and Aurora DSQL performance characteristics.

### Quick Start - Rigorous Demo

```bash
# Set your DSQL endpoint
export DSQL_ENDPOINT=your-cluster-endpoint.dsql.us-east-1.on.aws

# Run the complete rigorous demo
./run-rigorous-demo.sh

# Or run specific test suites
npm run test:validate    # Data consistency validation
npm run test:benchmark   # Performance benchmarking  
npm run test:load       # Load testing
npm run seed:large      # Large dataset seeding
```

### Test Suites

**Data Validation (`scripts/validate.js`)**
- Verifies data consistency between DynamoDB and DSQL
- Validates index creation and performance
- Ensures both systems return equivalent results

**Performance Benchmarking (`scripts/benchmark.js`)**
- Measures latency percentiles (P50, P95, P99) for both systems
- Tests point lookups, range queries, and complex analytics
- Provides statistical analysis of performance characteristics

**Load Testing (`scripts/loadTest.js`)**
- Concurrent read/write testing with configurable load
- Throughput measurement under sustained load
- Error rate monitoring and performance degradation analysis

**Large Dataset Seeding (`scripts/seedLarge.js`)**
- Configurable dataset sizes (1K-10K+ souls)
- Realistic data distribution and relationships
- Batch processing for efficient data loading

### Demo Modes

```bash
# Quick validation and benchmarks (2-3 minutes)
./run-rigorous-demo.sh quick

# Full comprehensive testing (5-10 minutes)  
./run-rigorous-demo.sh full

# Large dataset testing (10-20 minutes)
./run-rigorous-demo.sh full large

# Load testing only
./run-rigorous-demo.sh load

# Benchmark comparison only
./run-rigorous-demo.sh benchmark
```

### Expected Results

The rigorous testing demonstrates:

**DynamoDB Strengths:**
- Sub-10ms point lookups at any scale
- Predictable performance regardless of dataset size
- Linear scaling with partition distribution
- Consistent throughput under load

**Aurora DSQL Strengths:**  
- Complex analytics in single SQL queries
- Rich query optimization and indexing
- Full ACID transactions across tables
- Superior for ad-hoc analytical workloads

---

This repository illustrates both the **devil you know** (NoSQL agility) and the **devil you don't** (relational power) in action—so you can choose the best tool for managing soul contracts in your next spectral saga.
