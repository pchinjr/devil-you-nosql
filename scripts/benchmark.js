#!/usr/bin/env node

const { DynamoDBClient, QueryCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { DSQLSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class BenchmarkSuite {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    this.results = {};
  }

  async connectDSQL() {
    const signer = new DSQLSigner({ region: AWS_REGION });
    const token = await signer.getDbConnectAdminAuthToken({ hostname: DSQL_ENDPOINT });
    
    return new Client({
      host: DSQL_ENDPOINT,
      port: 5432,
      user: 'admin',
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
  }

  async measureLatency(name, fn, iterations = 100) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // Convert to ms
    }
    
    const sorted = times.sort((a, b) => a - b);
    this.results[name] = {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: times.reduce((a, b) => a + b) / times.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  async benchmarkDynamoPointLookup() {
    await this.measureLatency('DynamoDB Point Lookup', async () => {
      await this.dynamoClient.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { PK: { S: 'SOUL#soul-001' }, SK: { S: 'CONTRACT' } }
      }));
    });
  }

  async benchmarkDynamoQuery() {
    await this.measureLatency('DynamoDB Query', async () => {
      await this.dynamoClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': { S: 'SOUL#soul-001' } },
        Limit: 10
      }));
    });
  }

  async benchmarkDSQLPointLookup() {
    const client = await this.connectDSQL();
    await client.connect();
    
    await this.measureLatency('DSQL Point Lookup', async () => {
      await client.query('SELECT * FROM soul_contracts WHERE soul_id = $1', ['soul-001']);
    });
    
    await client.end();
  }

  async benchmarkDSQLJoin() {
    const client = await this.connectDSQL();
    await client.connect();
    
    await this.measureLatency('DSQL Join Query', async () => {
      await client.query(`
        SELECT sc.soul_id, sc.status, COUNT(sce.id) as event_count
        FROM soul_contracts sc
        LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id
        WHERE sc.soul_id = $1
        GROUP BY sc.soul_id, sc.status
      `, ['soul-001']);
    });
    
    await client.end();
  }

  async benchmarkDSQLAnalytics() {
    const client = await this.connectDSQL();
    await client.connect();
    
    await this.measureLatency('DSQL Analytics', async () => {
      await client.query(`
        WITH daily_totals AS (
          SELECT 
            DATE(created_at) as day,
            SUM(amount) as daily_total
          FROM soul_ledger 
          GROUP BY DATE(created_at)
        )
        SELECT 
          day,
          daily_total,
          SUM(daily_total) OVER (ORDER BY day) as running_total,
          RANK() OVER (ORDER BY daily_total DESC) as day_rank
        FROM daily_totals
        ORDER BY day
        LIMIT 10
      `);
    });
    
    await client.end();
  }

  printResults() {
    console.log('\n=== BENCHMARK RESULTS ===\n');
    
    Object.entries(this.results).forEach(([name, stats]) => {
      console.log(`${name}:`);
      console.log(`  Min:    ${stats.min.toFixed(2)}ms`);
      console.log(`  Avg:    ${stats.avg.toFixed(2)}ms`);
      console.log(`  P50:    ${stats.p50.toFixed(2)}ms`);
      console.log(`  P95:    ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99:    ${stats.p99.toFixed(2)}ms`);
      console.log(`  Max:    ${stats.max.toFixed(2)}ms`);
      console.log('');
    });
  }

  async run() {
    console.log('Starting comprehensive benchmark suite...\n');
    
    try {
      console.log('Benchmarking DynamoDB operations...');
      await this.benchmarkDynamoPointLookup();
      await this.benchmarkDynamoQuery();
      
      console.log('Benchmarking Aurora DSQL operations...');
      await this.benchmarkDSQLPointLookup();
      await this.benchmarkDSQLJoin();
      await this.benchmarkDSQLAnalytics();
      
      this.printResults();
    } catch (error) {
      console.error('Benchmark failed:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new BenchmarkSuite().run();
}

module.exports = BenchmarkSuite;
