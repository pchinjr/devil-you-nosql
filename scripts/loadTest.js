#!/usr/bin/env node

const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { DSQLSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class LoadTester {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    this.results = { dynamo: {}, dsql: {} };
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

  async runConcurrentTest(name, testFn, concurrency = 10, duration = 30000) {
    console.log(`Running ${name} (${concurrency} concurrent, ${duration/1000}s)...`);
    
    const results = { success: 0, error: 0, times: [] };
    const startTime = Date.now();
    const workers = [];
    
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.worker(testFn, results, startTime + duration));
    }
    
    await Promise.all(workers);
    
    const avgTime = results.times.length > 0 ? 
      results.times.reduce((a, b) => a + b) / results.times.length : 0;
    
    const throughput = (results.success / (duration / 1000)).toFixed(2);
    
    console.log(`  Success: ${results.success}, Errors: ${results.error}`);
    console.log(`  Avg latency: ${avgTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${throughput} ops/sec\n`);
    
    return { success: results.success, error: results.error, avgTime, throughput };
  }

  async worker(testFn, results, endTime) {
    while (Date.now() < endTime) {
      try {
        const start = Date.now();
        await testFn();
        const time = Date.now() - start;
        results.times.push(time);
        results.success++;
      } catch (error) {
        results.error++;
      }
      
      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async testDynamoReads() {
    return this.runConcurrentTest('DynamoDB Reads', async () => {
      const soulId = `soul-${Math.floor(Math.random() * 10).toString().padStart(3, '0')}`;
      await this.dynamoClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': { S: `SOUL#${soulId}` } },
        Limit: 5
      }));
    });
  }

  async testDynamoWrites() {
    return this.runConcurrentTest('DynamoDB Writes', async () => {
      const id = Math.random().toString(36).substring(7);
      await this.dynamoClient.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: { S: `SOUL#test-${id}` },
          SK: { S: `EVENT#${Date.now()}` },
          eventType: { S: 'StatusChange' },
          timestamp: { S: new Date().toISOString() }
        }
      }));
    });
  }

  async testDSQLReads() {
    const client = await this.connectDSQL();
    await client.connect();
    
    const result = await this.runConcurrentTest('DSQL Reads', async () => {
      const soulId = `soul-${Math.floor(Math.random() * 10).toString().padStart(3, '0')}`;
      await client.query('SELECT * FROM soul_contracts WHERE soul_id = $1', [soulId]);
    });
    
    await client.end();
    return result;
  }

  async testDSQLWrites() {
    const client = await this.connectDSQL();
    await client.connect();
    
    const result = await this.runConcurrentTest('DSQL Writes', async () => {
      const id = Math.random().toString(36).substring(7);
      await client.query(`
        INSERT INTO soul_contract_events (soul_contract_id, event_type, created_at)
        VALUES ((SELECT id FROM soul_contracts LIMIT 1), 'LoadTest', NOW())
      `);
    });
    
    await client.end();
    return result;
  }

  async testDSQLComplexQuery() {
    const client = await this.connectDSQL();
    await client.connect();
    
    const result = await this.runConcurrentTest('DSQL Complex Queries', async () => {
      await client.query(`
        SELECT 
          sc.soul_id,
          sc.status,
          COUNT(sce.id) as event_count,
          COALESCE(SUM(sl.amount), 0) as total_amount
        FROM soul_contracts sc
        LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id
        LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        WHERE sc.created_at > NOW() - INTERVAL '7 days'
        GROUP BY sc.id, sc.soul_id, sc.status
        ORDER BY total_amount DESC
        LIMIT 10
      `);
    });
    
    await client.end();
    return result;
  }

  async run() {
    console.log('=== LOAD TESTING SUITE ===\n');
    
    try {
      // DynamoDB tests
      this.results.dynamo.reads = await this.testDynamoReads();
      this.results.dynamo.writes = await this.testDynamoWrites();
      
      // DSQL tests
      this.results.dsql.reads = await this.testDSQLReads();
      this.results.dsql.writes = await this.testDSQLWrites();
      this.results.dsql.complex = await this.testDSQLComplexQuery();
      
      this.printSummary();
    } catch (error) {
      console.error('Load test failed:', error);
      process.exit(1);
    }
  }

  printSummary() {
    console.log('=== LOAD TEST SUMMARY ===\n');
    
    console.log('DynamoDB Performance:');
    console.log(`  Read Throughput:  ${this.results.dynamo.reads.throughput} ops/sec`);
    console.log(`  Write Throughput: ${this.results.dynamo.writes.throughput} ops/sec`);
    console.log(`  Read Latency:     ${this.results.dynamo.reads.avgTime.toFixed(2)}ms`);
    console.log(`  Write Latency:    ${this.results.dynamo.writes.avgTime.toFixed(2)}ms\n`);
    
    console.log('Aurora DSQL Performance:');
    console.log(`  Read Throughput:    ${this.results.dsql.reads.throughput} ops/sec`);
    console.log(`  Write Throughput:   ${this.results.dsql.writes.throughput} ops/sec`);
    console.log(`  Complex Throughput: ${this.results.dsql.complex.throughput} ops/sec`);
    console.log(`  Read Latency:       ${this.results.dsql.reads.avgTime.toFixed(2)}ms`);
    console.log(`  Write Latency:      ${this.results.dsql.writes.avgTime.toFixed(2)}ms`);
    console.log(`  Complex Latency:    ${this.results.dsql.complex.avgTime.toFixed(2)}ms`);
  }
}

if (require.main === module) {
  new LoadTester().run();
}

module.exports = LoadTester;
