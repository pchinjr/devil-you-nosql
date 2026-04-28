#!/usr/bin/env node

require('dotenv').config();
const {
  BatchGetItemCommand,
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
  TransactWriteItemsCommand
} = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

const LOCATIONS = [
  'Highway_66',
  'Desert_Crossroads',
  'Abandoned_Church',
  'City_Alley',
  'Graveyard',
  'Hell_Gate'
];

const dynamodb = new DynamoDBClient({ region: AWS_REGION });

class BenchmarkSuite {
  constructor(options = {}) {
    this.config = {
      profileIterations: coercePositiveInt(options.profileIterations) ?? coercePositiveInt(options.iterations) ?? 100,
      analyticsIterations: coercePositiveInt(options.analyticsIterations) ?? coercePositiveInt(options.iterations) ?? 50,
      batchIterations: coercePositiveInt(options.batchIterations) ?? coercePositiveInt(options.iterations) ?? 50,
      writeIterations: coercePositiveInt(options.writeIterations) ?? Math.min(coercePositiveInt(options.iterations) ?? 30, 50),
      complexIterations: coercePositiveInt(options.complexIterations) ?? Math.min(coercePositiveInt(options.iterations) ?? 25, 50),
      batchSize: coercePositiveInt(options.batchSize) ?? 8
    };
    this.dsqlClient = null;
    this.results = [];
  }

  async connectDSQL() {
    if (!DSQL_ENDPOINT) {
      throw new Error('DSQL_ENDPOINT must be set');
    }

    const signer = new DsqlSigner({ hostname: DSQL_ENDPOINT, region: AWS_REGION });
    const token = await signer.getDbConnectAdminAuthToken();

    this.dsqlClient = new Client({
      host: DSQL_ENDPOINT,
      port: 5432,
      user: 'admin',
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });

    await this.dsqlClient.connect();
  }

  async runBenchmark() {
    console.log('=== ARCHITECTURE BENCHMARK SUITE ===');
    console.log(`AWS Region: ${AWS_REGION}`);
    console.log(`DynamoDB Table: ${TABLE_NAME}`);
    console.log(`DSQL Endpoint: ${DSQL_ENDPOINT}`);
    console.log('Goal: compare equivalent result shapes and label the architectural trade-off.\n');

    await this.connectDSQL();

    try {
      await this.warmupConnections();
      const soulIds = await this.getComparableSoulIds(Math.max(this.config.batchSize, 10));
      const sampleSoulId = soulIds[0];

      await this.benchmarkProfileRead(sampleSoulId, this.config.profileIterations);
      await this.benchmarkLocationAnalytics(this.config.analyticsIterations);
      await this.benchmarkBatchContracts(soulIds.slice(0, this.config.batchSize), this.config.batchIterations);
      await this.benchmarkWriteBundle(this.config.writeIterations);
      await this.benchmarkComplexAnalytics(this.config.complexIterations);

      this.printExecutiveSummary();
    } finally {
      await this.dsqlClient.end();
    }
  }

  async warmupConnections() {
    console.log('Warming up clients...');
    try {
      await dynamodb.send(new ScanCommand({ TableName: TABLE_NAME, Limit: 1 }));
    } catch {
      // Ignore warmup failure; the real scenarios will report errors.
    }
    await this.dsqlClient.query('SELECT 1');
    console.log('Warmup complete.\n');
  }

  async benchmarkProfileRead(soulId, iterations) {
    console.log(`1. Complete Profile Read (${iterations} iterations)`);
    console.log('   Workload: fetch one contract plus its event and ledger history.');
    console.log('   DynamoDB shape: one partition query.');
    console.log('   DSQL shape: three indexed relational queries normalized to the same profile.\n');

    const dynamoTimes = [];
    const dsqlTimes = [];

    for (let i = 0; i < iterations; i++) {
      const dynamo = await timeAsync(() => this.fetchDynamoProfile(soulId));
      const dsql = await timeAsync(() => this.fetchDsqlProfile(soulId));

      if (i === 0) {
        assertProfileShape(dynamo.value, dsql.value, soulId);
      }

      dynamoTimes.push(dynamo.ms);
      dsqlTimes.push(dsql.ms);
      this.logProgress(i + 1, iterations);
    }

    this.recordComparison({
      name: 'Complete profile read',
      workload: 'Key-local operational read',
      dynamoStats: calculateStats(dynamoTimes),
      dsqlStats: calculateStats(dsqlTimes),
      takeaway: 'DynamoDB should usually win when the access pattern is a single known partition; DSQL remains competitive when indexed and result sizes are small.'
    });
  }

  async benchmarkLocationAnalytics(iterations) {
    console.log(`\n2. Location Analytics (${iterations} iterations)`);
    console.log('   Workload: count contracts, redeemed contracts, and ledger totals by location.');
    console.log('   DynamoDB shape: scan/query operational items and aggregate client-side.');
    console.log('   DSQL shape: one grouped SQL query.\n');

    const dynamoTimes = [];
    const dsqlTimes = [];

    for (let i = 0; i < iterations; i++) {
      const dynamo = await timeAsync(() => this.fetchDynamoLocationAnalytics());
      const dsql = await timeAsync(() => this.fetchDsqlLocationAnalytics());

      if (i === 0) {
        assertAnalyticsShape(dynamo.value, dsql.value);
      }

      dynamoTimes.push(dynamo.ms);
      dsqlTimes.push(dsql.ms);
      this.logProgress(i + 1, iterations);
    }

    this.recordComparison({
      name: 'Location analytics',
      workload: 'Cross-partition aggregation',
      dynamoStats: calculateStats(dynamoTimes),
      dsqlStats: calculateStats(dsqlTimes),
      takeaway: 'DSQL is the cleaner architectural fit for ad hoc relational analytics; DynamoDB needs a precomputed aggregate, stream pipeline, or client-side fan-out.'
    });
  }

  async benchmarkBatchContracts(soulIds, iterations) {
    console.log(`\n3. Batch Contract Fetch (${iterations} iterations)`);
    console.log(`   Workload: fetch ${soulIds.length} contracts by ID.`);
    console.log('   DynamoDB shape: BatchGetItem.');
    console.log('   DSQL shape: primary-key IN query.\n');

    if (soulIds.length === 0) {
      throw new Error('No comparable soul IDs found for batch benchmark');
    }

    const dynamoTimes = [];
    const dsqlTimes = [];
    const dynamoIndividualTimes = [];

    for (let i = 0; i < iterations; i++) {
      const dynamo = await timeAsync(() => this.fetchDynamoContractsBatch(soulIds));
      const dsql = await timeAsync(() => this.fetchDsqlContractsBatch(soulIds));
      const dynamoIndividual = await timeAsync(() => this.fetchDynamoContractsIndividually(soulIds));

      if (i === 0) {
        assertSameIds(dynamo.value, dsql.value, 'batch contracts');
      }

      dynamoTimes.push(dynamo.ms);
      dsqlTimes.push(dsql.ms);
      dynamoIndividualTimes.push(dynamoIndividual.ms);
      this.logProgress(i + 1, iterations);
    }

    this.recordComparison({
      name: 'Batch contract fetch',
      workload: 'Multiple key lookups',
      dynamoStats: calculateStats(dynamoTimes),
      dsqlStats: calculateStats(dsqlTimes),
      extra: `DynamoDB individual-key baseline median: ${calculateStats(dynamoIndividualTimes).median.toFixed(1)}ms`,
      takeaway: 'Both systems handle key batches well. DynamoDB BatchGet avoids repeated round trips; DSQL keeps the query compact and composable.'
    });
  }

  async benchmarkWriteBundle(iterations) {
    console.log(`\n4. Transactional Write Bundle (${iterations} iterations)`);
    console.log('   Workload: update one contract and append one event atomically.');
    console.log('   Data safety: benchmark-only records are created before timing and deleted afterward.\n');

    const dynamoTimes = [];
    const dsqlTimes = [];
    const runId = `benchmark_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    try {
      await this.setupBenchmarkWriteRecords(runId, iterations);

      for (let i = 0; i < iterations; i++) {
        const timestamp = new Date().toISOString();
        const dynamoSoulId = `${runId}_dynamo_${i}`;
        const dsqlSoulId = `${runId}_dsql_${i}`;

        const dynamo = await timeAsync(() => this.writeDynamoBundle(dynamoSoulId, timestamp, i));
        const dsql = await timeAsync(() => this.writeDsqlBundle(dsqlSoulId, timestamp, i));

        dynamoTimes.push(dynamo.ms);
        dsqlTimes.push(dsql.ms);
        this.logProgress(i + 1, iterations);
      }
    } finally {
      await this.cleanupBenchmarkWrites(runId, iterations);
    }

    this.recordComparison({
      name: 'Transactional write bundle',
      workload: 'Small ACID write',
      dynamoStats: calculateStats(dynamoTimes),
      dsqlStats: calculateStats(dsqlTimes),
      takeaway: 'DynamoDB transactions are a strong fit for small partition-oriented writes. DSQL buys relational semantics and SQL constraints at a usually higher write latency.'
    });
  }

  async benchmarkComplexAnalytics(iterations) {
    console.log(`\n5. Complex SQL Analytics (${iterations} iterations)`);
    console.log('   Workload: grouped metrics with ranking/window functions.');
    console.log('   DynamoDB comparison: intentionally not timed because an equivalent query requires a different data product or client-side analytical pipeline.\n');

    const dsqlTimes = [];
    for (let i = 0; i < iterations; i++) {
      const dsql = await timeAsync(() => this.fetchDsqlComplexAnalytics());
      dsqlTimes.push(dsql.ms);
      this.logProgress(i + 1, iterations);
    }

    const stats = calculateStats(dsqlTimes);
    console.log('\nComplex SQL analytics results');
    printStats('DSQL', stats);
    console.log('Architectural takeaway: use SQL/DSQL when the business needs flexible analytics on normalized relationships. DynamoDB can support this only with deliberate aggregate tables, streams, or a warehouse-style read model.\n');

    this.results.push({
      name: 'Complex SQL analytics',
      workload: 'Relational BI query',
      dsqlStats: stats,
      winner: 'DSQL',
      ratio: null,
      takeaway: 'DSQL is the definite fit for windowed/ad hoc relational analytics unless DynamoDB is paired with a purpose-built analytical projection.'
    });
  }

  async fetchDynamoProfile(soulId) {
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `SOUL#${soulId}` }
      },
      ScanIndexForward: true
    }));

    const items = result.Items || [];
    return {
      soulId,
      contracts: items.filter(item => item.SK?.S === 'CONTRACT').length,
      events: items.filter(item => item.SK?.S?.startsWith('EVENT#')).length,
      ledgerEntries: items.filter(item => item.SK?.S?.startsWith('LEDGER#')).length,
      totalLedger: items
        .filter(item => item.SK?.S?.startsWith('LEDGER#'))
        .reduce((sum, item) => sum + Number(item.amount?.N || 0), 0)
    };
  }

  async fetchDsqlProfile(soulId) {
    const [contract, events, ledger] = await Promise.all([
      this.dsqlClient.query('SELECT id FROM soul_contracts WHERE id = $1', [soulId]),
      this.dsqlClient.query('SELECT id FROM soul_contract_events WHERE soul_contract_id = $1', [soulId]),
      this.dsqlClient.query('SELECT amount FROM soul_ledger WHERE soul_contract_id = $1', [soulId])
    ]);

    return {
      soulId,
      contracts: contract.rowCount,
      events: events.rowCount,
      ledgerEntries: ledger.rowCount,
      totalLedger: ledger.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    };
  }

  async fetchDynamoLocationAnalytics() {
    const [contracts, ledgerEntries] = await Promise.all([
      scanAll({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: {
          ':sk': { S: 'CONTRACT' }
        }
      }),
      scanAll({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(SK, :ledgerPrefix)',
        ExpressionAttributeValues: {
          ':ledgerPrefix': { S: 'LEDGER#' }
        }
      })
    ]);

    const contractBySoul = new Map();
    const byLocation = new Map(LOCATIONS.map(location => [location, {
      location,
      soulCount: 0,
      redeemed: 0,
      totalPower: 0
    }]));

    for (const item of contracts) {
      const soulId = item.soulId?.S || item.PK?.S?.replace('SOUL#', '');
      const location = item.contract_location?.S || 'Unknown';
      const status = item.status?.S || item.contract_status?.S || 'Unknown';
      contractBySoul.set(soulId, { location, status });
      if (!byLocation.has(location)) {
        byLocation.set(location, { location, soulCount: 0, redeemed: 0, totalPower: 0 });
      }
      const bucket = byLocation.get(location);
      bucket.soulCount += 1;
      if (status === 'Redeemed') bucket.redeemed += 1;
    }

    for (const item of ledgerEntries) {
      const soulId = item.PK?.S?.replace('SOUL#', '');
      const contract = contractBySoul.get(soulId);
      if (!contract) continue;
      byLocation.get(contract.location).totalPower += Number(item.amount?.N || 0);
    }

    return normalizeAnalyticsRows(Array.from(byLocation.values()));
  }

  async fetchDsqlLocationAnalytics() {
    const result = await this.dsqlClient.query(`
      SELECT
        sc.contract_location AS location,
        COUNT(DISTINCT sc.id)::int AS soul_count,
        COUNT(DISTINCT CASE WHEN sc.contract_status = 'Redeemed' THEN sc.id END)::int AS redeemed,
        COALESCE(SUM(sl.amount), 0)::numeric AS total_power
      FROM soul_contracts sc
      LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
      GROUP BY sc.contract_location
      ORDER BY sc.contract_location
    `);

    return normalizeAnalyticsRows(result.rows.map(row => ({
      location: row.location,
      soulCount: Number(row.soul_count),
      redeemed: Number(row.redeemed),
      totalPower: Number(row.total_power)
    })));
  }

  async fetchDynamoContractsBatch(soulIds) {
    const result = await dynamodb.send(new BatchGetItemCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: soulIds.map(id => ({
            PK: { S: `SOUL#${id}` },
            SK: { S: 'CONTRACT' }
          }))
        }
      }
    }));
    return (result.Responses?.[TABLE_NAME] || []).map(item => item.soulId?.S).sort();
  }

  async fetchDynamoContractsIndividually(soulIds) {
    const ids = [];
    for (const soulId of soulIds) {
      const result = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': { S: `SOUL#${soulId}` },
          ':sk': { S: 'CONTRACT' }
        }
      }));
      ids.push(...(result.Items || []).map(item => item.soulId?.S));
    }
    return ids.sort();
  }

  async fetchDsqlContractsBatch(soulIds) {
    const result = await this.dsqlClient.query(
      'SELECT id FROM soul_contracts WHERE id = ANY($1::text[]) ORDER BY id',
      [soulIds]
    );
    return result.rows.map(row => row.id).sort();
  }

  async setupBenchmarkWriteRecords(runId, iterations) {
    console.log('   Preparing isolated write benchmark records...');
    const now = new Date().toISOString();
    const dynamoRequests = [];

    for (let i = 0; i < iterations; i++) {
      const soulId = `${runId}_dynamo_${i}`;
      dynamoRequests.push({
        PutRequest: {
          Item: {
            PK: { S: `SOUL#${soulId}` },
            SK: { S: 'CONTRACT' },
            soulId: { S: soulId },
            status: { S: 'Benchmark' },
            soul_type: { S: 'Benchmark' },
            contract_location: { S: 'Benchmark' },
            createdAt: { S: now },
            updated_at: { S: now }
          }
        }
      });
    }

    await batchWriteAll(dynamoRequests);

    await this.dsqlClient.query('BEGIN');
    try {
      for (let i = 0; i < iterations; i++) {
        await this.dsqlClient.query(
          `INSERT INTO soul_contracts (id, contract_status, soul_type, contract_location, updated_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [`${runId}_dsql_${i}`, 'Benchmark', 'Benchmark', 'Benchmark', now]
        );
      }
      await this.dsqlClient.query('COMMIT');
    } catch (error) {
      await this.dsqlClient.query('ROLLBACK');
      throw error;
    }
  }

  async writeDynamoBundle(soulId, timestamp, index) {
    await dynamodb.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: {
              PK: { S: `SOUL#${soulId}` },
              SK: { S: 'CONTRACT' }
            },
            UpdateExpression: 'SET updated_at = :timestamp',
            ExpressionAttributeValues: {
              ':timestamp': { S: timestamp }
            }
          }
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: { S: `SOUL#${soulId}` },
              SK: { S: `EVENT#${timestamp}` },
              description: { S: `Benchmark event ${index}` },
              timestamp: { S: timestamp }
            }
          }
        }
      ]
    }));
  }

  async writeDsqlBundle(soulId, timestamp, index) {
    await this.dsqlClient.query('BEGIN');
    try {
      await this.dsqlClient.query(
        'UPDATE soul_contracts SET updated_at = $1 WHERE id = $2',
        [timestamp, soulId]
      );
      await this.dsqlClient.query(
        'INSERT INTO soul_contract_events (soul_contract_id, description, event_time) VALUES ($1, $2, $3)',
        [soulId, `Benchmark event ${index}`, timestamp]
      );
      await this.dsqlClient.query('COMMIT');
    } catch (error) {
      await this.dsqlClient.query('ROLLBACK');
      throw error;
    }
  }

  async cleanupBenchmarkWrites(runId, iterations) {
    console.log('   Cleaning up write benchmark records...');
    const deleteRequests = [];
    for (let index = 0; index < iterations; index++) {
      const soulId = `${runId}_dynamo_${index}`;
      const result = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `SOUL#${soulId}` }
        }
      }));
      for (const item of result.Items || []) {
        deleteRequests.push({
          DeleteRequest: {
            Key: {
              PK: item.PK,
              SK: item.SK
            }
          }
        });
      }
    }
    await batchWriteAll(deleteRequests);

    const pattern = `${runId}_dsql_%`;
    await this.dsqlClient.query('DELETE FROM soul_contract_events WHERE soul_contract_id LIKE $1', [pattern]);
    await this.dsqlClient.query('DELETE FROM soul_ledger WHERE soul_contract_id LIKE $1', [pattern]);
    await this.dsqlClient.query('DELETE FROM soul_contracts WHERE id LIKE $1', [pattern]);
  }

  async fetchDsqlComplexAnalytics() {
    return this.dsqlClient.query(`
      WITH ledger_totals AS (
        SELECT
          soul_contract_id,
          SUM(amount) AS total_power
        FROM soul_ledger
        GROUP BY soul_contract_id
      ),
      event_totals AS (
        SELECT
          soul_contract_id,
          COUNT(*) AS event_count
        FROM soul_contract_events
        GROUP BY soul_contract_id
      ),
      soul_totals AS (
        SELECT
          sc.id,
          sc.contract_location,
          sc.contract_status,
          COALESCE(lt.total_power, 0) AS total_power,
          COALESCE(et.event_count, 0) AS event_count
        FROM soul_contracts sc
        LEFT JOIN ledger_totals lt ON sc.id = lt.soul_contract_id
        LEFT JOIN event_totals et ON sc.id = et.soul_contract_id
      ),
      location_rollup AS (
        SELECT
          contract_location,
          COUNT(*) AS souls,
          SUM(total_power) AS location_power,
          AVG(event_count) AS avg_events,
          COUNT(CASE WHEN contract_status = 'Redeemed' THEN 1 END) AS redeemed
        FROM soul_totals
        GROUP BY contract_location
      )
      SELECT
        contract_location,
        souls,
        location_power,
        ROUND(avg_events, 2) AS avg_events,
        ROUND(redeemed * 100.0 / souls, 1) AS redemption_rate,
        RANK() OVER (ORDER BY location_power DESC) AS power_rank
      FROM location_rollup
      ORDER BY power_rank
    `);
  }

  async getComparableSoulIds(count) {
    const items = await scanAll({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':sk': { S: 'CONTRACT' }
      }
    });

    const soulIds = [];
    for (const item of items) {
      const soulId = item.soulId?.S || item.PK?.S?.replace('SOUL#', '');
      if (!soulId) continue;
      const result = await this.dsqlClient.query('SELECT id FROM soul_contracts WHERE id = $1', [soulId]);
      if (result.rowCount > 0) {
        soulIds.push(soulId);
      }
      if (soulIds.length >= count) {
        break;
      }
    }

    if (soulIds.length === 0) {
      throw new Error('No comparable records found. Run npm run seed:small or npm run seed:large first.');
    }

    return soulIds;
  }

  recordComparison(result) {
    const ratio = result.dsqlStats.median / result.dynamoStats.median;
    const winner = chooseWinner(result.dynamoStats, result.dsqlStats);
    this.results.push({ ...result, ratio, winner });

    console.log(`\n${result.name} results`);
    printStats('DynamoDB', result.dynamoStats);
    printStats('DSQL', result.dsqlStats);
    if (result.extra) console.log(result.extra);
    console.log(`Median ratio: DSQL is ${ratio.toFixed(2)}x DynamoDB median latency.`);
    console.log(`Architectural takeaway: ${result.takeaway}`);
    console.log(`Scenario winner: ${winner}\n`);
  }

  printExecutiveSummary() {
    console.log('\n=== ARCHITECT TAKEAWAYS ===');
    for (const result of this.results) {
      const ratioText = result.ratio ? ` (${result.ratio.toFixed(2)}x DSQL/DynamoDB median)` : '';
      console.log(`- ${result.name}: ${result.winner}${ratioText}. ${result.takeaway}`);
    }
    console.log('\nDecision rule: choose DynamoDB for fixed, key-oriented operational paths; choose DSQL when query flexibility, joins, and analytics are first-class requirements. Mixed systems are justified when both workload families matter.');
  }

  logProgress(current, total) {
    const interval = Math.max(1, Math.floor(total / 5));
    if (current % interval === 0 || current === total) {
      console.log(`   Progress: ${current}/${total}`);
    }
  }
}

async function scanAll(params) {
  const items = [];
  let lastEvaluatedKey;
  do {
    const result = await dynamodb.send(new ScanCommand({
      ...params,
      ExclusiveStartKey: lastEvaluatedKey
    }));
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
}

async function batchWriteAll(requests) {
  for (let i = 0; i < requests.length; i += 25) {
    let chunk = requests.slice(i, i + 25);
    while (chunk.length > 0) {
      const response = await dynamodb.send(new BatchWriteItemCommand({
        RequestItems: {
          [TABLE_NAME]: chunk
        }
      }));
      chunk = response.UnprocessedItems?.[TABLE_NAME] || [];
      if (chunk.length > 0) {
        await wait(250);
      }
    }
  }
}

async function timeAsync(fn) {
  const start = process.hrtime.bigint();
  const value = await fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { value, ms };
}

function calculateStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1
    ? sorted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (n - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const p99 = percentile(sorted, 0.99);
  const mad = percentile(sorted.map(value => Math.abs(value - median)).sort((a, b) => a - b), 0.5);

  return {
    n,
    mean,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    stdDev,
    mad,
    cv: mean === 0 ? 0 : (stdDev / mean) * 100,
    ci95: n > 1 ? (1.96 * stdDev) / Math.sqrt(n) : 0,
    p95,
    p99
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function printStats(label, stats) {
  console.log(`${label}: median ${stats.median.toFixed(1)}ms, mean ${stats.mean.toFixed(1)}ms ± ${stats.ci95.toFixed(1)}ms, p95 ${stats.p95.toFixed(1)}ms, p99 ${stats.p99.toFixed(1)}ms, CV ${stats.cv.toFixed(1)}%, n=${stats.n}`);
}

function chooseWinner(dynamoStats, dsqlStats) {
  const medianRatio = dsqlStats.median / dynamoStats.median;
  const p95Ratio = dsqlStats.p95 / dynamoStats.p95;

  if (medianRatio <= 0.85 && p95Ratio <= 1.15) return 'DSQL';
  if (medianRatio >= 1.15 && p95Ratio >= 0.85) return 'DynamoDB';
  return 'Workload-dependent';
}

function normalizeAnalyticsRows(rows) {
  return rows
    .map(row => ({
      location: row.location,
      soulCount: Number(row.soulCount || 0),
      redeemed: Number(row.redeemed || 0),
      totalPower: Number(row.totalPower || 0)
    }))
    .filter(row => row.soulCount > 0 || row.totalPower > 0)
    .sort((a, b) => a.location.localeCompare(b.location));
}

function assertProfileShape(dynamo, dsql, soulId) {
  const fields = ['contracts', 'events', 'ledgerEntries', 'totalLedger'];
  const mismatches = fields.filter(field => dynamo[field] !== dsql[field]);
  if (mismatches.length > 0) {
    throw new Error(`Profile result mismatch for ${soulId}: ${mismatches.join(', ')}`);
  }
}

function assertAnalyticsShape(dynamoRows, dsqlRows) {
  const dynamo = new Map(dynamoRows.map(row => [row.location, row]));
  const dsql = new Map(dsqlRows.map(row => [row.location, row]));
  const locations = new Set([...dynamo.keys(), ...dsql.keys()]);

  for (const location of locations) {
    const dyn = dynamo.get(location);
    const sql = dsql.get(location);
    if (!dyn || !sql) {
      throw new Error(`Analytics location mismatch: ${location}`);
    }
    for (const field of ['soulCount', 'redeemed', 'totalPower']) {
      if (dyn[field] !== sql[field]) {
        throw new Error(`Analytics mismatch for ${location}.${field}: DynamoDB=${dyn[field]}, DSQL=${sql[field]}`);
      }
    }
  }
}

function assertSameIds(left, right, label) {
  if (left.join('|') !== right.join('|')) {
    throw new Error(`${label} ID mismatch: ${left.join(',')} vs ${right.join(',')}`);
  }
}

function parseCliArgs(argv) {
  const options = {};
  if (argv[0] && !argv[0].startsWith('--')) {
    options.iterations = argv[0];
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function coercePositiveInt(value) {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const benchmark = new BenchmarkSuite(parseCliArgs(process.argv.slice(2)));
  await benchmark.runBenchmark();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
