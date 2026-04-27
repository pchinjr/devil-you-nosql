# Benchmark Scenario Walkthrough

This benchmark suite compares DynamoDB and Aurora DSQL by workload shape, not by generic database category. Each timed scenario either validates equivalent result shapes across both systems or explicitly calls out why an equivalent DynamoDB query would require a separate read model.

Run from a clean dataset when you want comparable results:

```bash
npm run reset:data
npm run seed:small
npm run benchmark
```

For larger samples, seed the large workload first:

```bash
npm run reset:data
npm run seed:large
npm run benchmark
```

You can tune iteration counts:

```bash
node scripts/benchmark.js \
  --profile-iterations 100 \
  --analytics-iterations 50 \
  --batch-iterations 50 \
  --write-iterations 30 \
  --complex-iterations 25
```

## How To Read The Output

Each comparable scenario prints:

- `median`: the best single number for typical latency.
- `mean +/- 95% CI`: useful for drift, but more sensitive to outliers.
- `p95` and `p99`: tail latency indicators.
- `CV`: coefficient of variation, a rough consistency signal.
- `Median ratio`: DSQL median divided by DynamoDB median. Values above `1.00x` mean DSQL was slower for that scenario; values below `1.00x` mean DSQL was faster.
- `Scenario winner`: a workload-specific winner based on median and tail behavior.

The final `ARCHITECT TAKEAWAYS` section is the executive summary. It is intended to answer: "Which data model fits this workload best, and why?"

## Scenario 1: Complete Profile Read

**Question:** What happens when the application already knows the entity ID and needs the full profile?

**DynamoDB path:**

- Runs one partition query against `PK = SOUL#<id>`.
- Retrieves the contract, events, and ledger rows from one item collection.
- Matches the access pattern DynamoDB is designed for: key-local reads with predictable shape.

**Aurora DSQL path:**

- Reads the contract row from `soul_contracts`.
- Reads related events from `soul_contract_events`.
- Reads related ledger rows from `soul_ledger`.
- Normalizes the result into the same profile shape as DynamoDB before comparison.

**What is validated:**

- Both systems return the same contract count.
- Both return the same event count.
- Both return the same ledger row count.
- Both return the same total ledger amount.

**Architect takeaway:**

DynamoDB is usually the better operational fit when the dominant query is "fetch everything for this known entity." DSQL can be competitive when indexed and small, but the relational model is doing more independent lookups.

## Scenario 2: Location Analytics

**Question:** What happens when the application needs grouped business metrics across many entities?

**DynamoDB path:**

- Scans/query-selects contract items and ledger items.
- Joins ledger rows to contracts client-side by soul ID.
- Aggregates metrics by `contract_location` in JavaScript.

**Aurora DSQL path:**

- Runs one grouped SQL query over normalized tables.
- Uses SQL aggregation to compute counts and ledger totals by location.

**Metrics compared:**

- Soul count by location.
- Redeemed count by location.
- Total ledger power by location.

**Architect takeaway:**

DSQL is the stronger fit for ad hoc grouped analytics because the query stays declarative and server-side. DynamoDB can serve this workload well only if you design an aggregate table, stream processor, or analytical projection ahead of time.

## Scenario 3: Batch Contract Fetch

**Question:** How do the systems behave when an admin workflow loads several known contracts at once?

**DynamoDB path:**

- Uses `BatchGetItem` for the selected contract keys.
- Also measures individual DynamoDB key lookups as a baseline for round-trip cost.

**Aurora DSQL path:**

- Uses a primary-key `WHERE id = ANY($1::text[])` query.
- Returns the same set of contract IDs as the DynamoDB batch path.

**What is validated:**

- Both systems return the same contract ID set.

**Architect takeaway:**

Both systems are reasonable for multiple known keys. DynamoDB's batch API avoids repeated round trips, while DSQL keeps the request naturally composable with SQL filters, joins, and ordering.

## Scenario 4: Transactional Write Bundle

**Question:** What is the cost of a small atomic write that updates a contract and appends an event?

**DynamoDB path:**

- Creates benchmark-only contract records before timing starts.
- Times a `TransactWriteItems` bundle:
  - update the benchmark contract
  - insert a benchmark event

**Aurora DSQL path:**

- Creates benchmark-only contract rows before timing starts.
- Times an explicit SQL transaction:
  - `BEGIN`
  - update the benchmark contract
  - insert a benchmark event
  - `COMMIT`

**Data safety:**

The benchmark deletes all benchmark-only DynamoDB and DSQL records in a cleanup step. Running this scenario should not mutate the seeded demo dataset.

**Architect takeaway:**

DynamoDB transactions are a strong fit for small, predictable operational writes. DSQL usually costs more latency but provides a relational transaction model that can expand naturally as constraints and multi-table invariants grow.

## Scenario 5: Complex SQL Analytics

**Question:** What happens when the workload needs analytical composition: grouping, ranking, and derived metrics?

**Aurora DSQL path:**

- Runs a SQL query using CTEs and a window function.
- Computes location rollups, power totals, average event counts, redemption rates, and ranks.

**DynamoDB path:**

- Not timed as an equivalent query.
- The benchmark intentionally frames this as requiring a different DynamoDB design: aggregate items, streams, ETL, or a warehouse-style read model.

**Architect takeaway:**

DSQL is the definite fit when flexible relational analytics are a first-class requirement. DynamoDB can support the business outcome, but only through deliberate denormalization or a separate analytical pipeline.

## Decision Rule

Use the benchmark results as a workload map:

- Choose **DynamoDB** when access patterns are fixed, key-oriented, high-throughput, and operational.
- Choose **Aurora DSQL** when joins, ad hoc querying, grouped analytics, and SQL composition are core requirements.
- Use **both** when the product has a latency-sensitive operational path and a separate analytical or exploratory path.

The benchmark is most useful after you seed data that resembles the scale and shape of the workload you expect in production.
