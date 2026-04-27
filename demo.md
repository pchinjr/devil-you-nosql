# Devil You NoSQL Demo Walkthrough

This demo is the narrative companion to the benchmark suite. It is meant for a live architecture conversation: show the same soul-contract domain in DynamoDB and Aurora DSQL, then explain which workload shape naturally belongs in each system.

For rigorous repeatable timing, use `npm run benchmark`. For a guided talk track with sample rows and explanatory output, use `npm run demo`.

## Before You Demo

Start from a clean dataset when presenting:

```bash
npm run reset:data
npm run seed:small
npm run check:parity
```

Then run the full demo:

```bash
npm run demo
```

Or run one scenario:

```bash
node scripts/demo.js scenario1
node scripts/demo.js scenario2
node scripts/demo.js scenario3
node scripts/demo.js scenario4
node scripts/demo.js scenario5
```

The web UI exposes the same scenario selector under the Benchmark tab.

## Opening Frame

The project asks a practical architecture question: when do you choose the data model optimized for known operational access patterns, and when do you choose the SQL model optimized for flexible relationships and analytics?

Use this framing:

- DynamoDB is the fixed-access-pattern engine: fast key lookups, single-table item collections, explicit denormalization.
- Aurora DSQL is the relational query engine: normalized rows, SQL transactions, joins, grouped analytics, and ad hoc exploration.
- Neither is universally better. The right answer depends on workload shape.

## Scenario 1: Complete Soul Profile

**Command:**

```bash
node scripts/demo.js scenario1
```

**Story:** A user-facing app needs one complete soul profile: the contract, event history, and ledger history.

**DynamoDB path:**

- One partition query against `PK = SOUL#<id>`.
- Returns the contract, events, and ledger entries as one single-table item collection.
- Demonstrates the strength of modeling related data into one known partition.

**DSQL path:**

- Reads the contract row from `soul_contracts`.
- Reads related events from `soul_contract_events`.
- Reads related ledger entries from `soul_ledger`.
- Renders those normalized rows into the same profile shape.

**Architect takeaway:** DynamoDB is the natural fit for known entity-centric reads. DSQL remains easy to reason about, but the normalized shape costs additional query work for this access pattern.

## Scenario 2: Business Analytics

**Command:**

```bash
node scripts/demo.js scenario2
```

**Story:** An executive dashboard needs location-level business metrics.

**DSQL path:**

- Uses SQL aggregation to calculate counts, redeemed totals, power totals, averages, and redemption rates.
- Keeps the analytical logic server-side and declarative.

**DynamoDB path:**

- Queries contracts by location.
- Fetches each soul's ledger entries.
- Aggregates and sorts results in application code.

**Architect takeaway:** DSQL is the cleaner fit for grouped analytics and changing dashboard questions. DynamoDB can serve the result, but only by doing client-side fan-out or by maintaining purpose-built aggregate projections.

## Scenario 3: Transactional Write Bundle

**Command:**

```bash
node scripts/demo.js scenario3
```

**Story:** A redemption operation updates a contract, appends an event, and appends a ledger entry.

**Data safety:** This scenario uses temporary demo-only records and deletes them after the scenario. It should not mutate the seeded demo dataset.

**DynamoDB path:**

- Uses `TransactWrite` against records in one synthetic soul partition.
- Updates the contract item and inserts event and ledger items.

**DSQL path:**

- Uses `BEGIN` / `COMMIT`.
- Updates `soul_contracts`.
- Inserts into `soul_contract_events`.
- Inserts into `soul_ledger`.

**Architect takeaway:** DynamoDB is a strong fit for small predictable operational write bundles. DSQL is the better fit when the write needs relational constraints, normalized multi-table invariants, or SQL-side business rules.

## Scenario 4: Batch Contract Fetch

**Command:**

```bash
node scripts/demo.js scenario4
```

**Story:** An admin dashboard loads several known contracts at once.

**DynamoDB path:**

- Uses `BatchGet` for multiple contract keys.
- Compares that with individual DynamoDB `Get` calls to show round-trip overhead.

**DSQL path:**

- Uses a primary-key `ANY($1::text[])` query.
- Also shows parallel individual SQL queries as a less ideal approach.

**Architect takeaway:** Both systems can batch known IDs effectively. DynamoDB has a purpose-built batch API; DSQL keeps the operation composable with filters, joins, ordering, and additional relational context.

## Scenario 5: Advanced Analytics

**Command:**

```bash
node scripts/demo.js scenario5
```

**Story:** A portfolio-risk dashboard needs multi-step business logic, rankings, and derived metrics.

**DSQL path:**

- Uses CTEs to pre-aggregate ledger and event metrics.
- Builds per-soul metrics.
- Rolls them up by location.
- Uses ranking and derived percentages for dashboard output.

**DynamoDB path:**

- Not executed as a timed equivalent.
- The demo explains that this workload requires a separate analytical design in DynamoDB: aggregate tables, streams, ETL, or a warehouse-style read model.

**Architect takeaway:** DSQL is the definite fit for ad hoc relational analytics. DynamoDB can support the business outcome, but the architecture needs an explicit projection or pipeline.

## Final Decision Rule

Use the same decision rule as the benchmark suite:

- Choose **DynamoDB** for fixed, key-oriented operational paths.
- Choose **Aurora DSQL** when query flexibility, joins, and analytics are first-class requirements.
- Use **both** when the product has latency-sensitive operational workflows and separate analytical/exploratory workflows.

## Presenter Notes

- Do not present one run's latency numbers as universal truth. Treat them as local observations.
- Use `npm run benchmark` for repeatable comparisons and `npm run demo` for storytelling.
- If parity fails before a demo, run:

```bash
npm run reset:data
npm run seed:small
npm run check:parity
```
