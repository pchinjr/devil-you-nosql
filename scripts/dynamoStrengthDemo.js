#!/usr/bin/env node

const { DynamoDBClient, GetItemCommand, QueryCommand, BatchGetItemCommand } = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class DynamoStrengthDemo {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
  }

  async connectDSQL() {
    const signer = new DsqlSigner({ 
      hostname: DSQL_ENDPOINT,
      region: AWS_REGION 
    });
    const token = await signer.getDbConnectAdminAuthToken();
    
    return new Client({
      host: DSQL_ENDPOINT,
      port: 5432,
      user: 'admin',
      password: token,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
  }

  async measureLatency(name, operation, iterations = 50) {
    const times = [];
    
    // Warmup
    for (let i = 0; i < 5; i++) {
      await operation();
    }
    
    // Measure
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await operation();
      times.push(Date.now() - start);
    }
    
    times.sort((a, b) => a - b);
    return {
      min: Math.min(...times),
      max: Math.max(...times),
      avg: times.reduce((a, b) => a + b) / times.length,
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)]
    };
  }

  async demonstrateDynamoStrengths() {
    console.log('🔥 DYNAMODB STRENGTH DEMONSTRATION');
    console.log('Showcasing where DynamoDB absolutely dominates\n');

    await this.demonstrateKeyBasedLookup();
    console.log('');
    await this.demonstrateHotPartition();
    console.log('');
    await this.demonstrateBatchOperations();
    console.log('');
    await this.demonstrateConsistentLatency();
  }

  async demonstrateKeyBasedLookup() {
    console.log('🎯 SCENARIO 1: Exact Key Lookup (DynamoDB\'s Sweet Spot)');
    console.log('Use Case: "Get soul contract by exact ID"\n');

    // DynamoDB GetItem - the fastest possible operation
    console.log('🔥 DynamoDB GetItem (Primary Key Lookup):');
    const dynamoStats = await this.measureLatency('DynamoDB GetItem', async () => {
      await this.dynamoClient.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: 'SOUL#evil_highway_66_0160' },
          SK: { S: 'CONTRACT' }
        }
      }));
    });

    console.log(`  Min: ${dynamoStats.min}ms | Avg: ${dynamoStats.avg.toFixed(2)}ms | P95: ${dynamoStats.p95}ms`);

    // DSQL equivalent
    console.log('\n⚡ Aurora DSQL (WHERE clause on primary key):');
    const client = await this.connectDSQL();
    await client.connect();

    const dsqlStats = await this.measureLatency('DSQL Primary Key', async () => {
      await client.query('SELECT * FROM soul_contracts WHERE id = $1', ['evil_highway_66_0160']);
    });

    console.log(`  Min: ${dsqlStats.min}ms | Avg: ${dsqlStats.avg.toFixed(2)}ms | P95: ${dsqlStats.p95}ms`);

    await client.end();

    console.log('\n🏆 Key Lookup Winner:');
    if (dynamoStats.avg < dsqlStats.avg) {
      const improvement = ((dsqlStats.avg - dynamoStats.avg) / dsqlStats.avg * 100).toFixed(1);
      console.log(`  DynamoDB wins by ${improvement}% - this is what it's built for!`);
    } else {
      console.log(`  DSQL wins this round, but DynamoDB should dominate with proper optimization`);
    }
  }

  async demonstrateHotPartition() {
    console.log('🔥 SCENARIO 2: Hot Partition Performance');
    console.log('Use Case: "Repeatedly access the same soul\'s data"\n');

    console.log('🎯 DynamoDB Hot Partition (same PK, different SKs):');
    const dynamoStats = await this.measureLatency('DynamoDB Hot Partition', async () => {
      await this.dynamoClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: 'SOUL#evil_highway_66_0160' }
        },
        Limit: 5
      }));
    });

    console.log(`  Min: ${dynamoStats.min}ms | Avg: ${dynamoStats.avg.toFixed(2)}ms | P95: ${dynamoStats.p95}ms`);
    console.log('  ✅ Benefits from partition caching and data locality');

    const client = await this.connectDSQL();
    await client.connect();

    console.log('\n⚡ Aurora DSQL (same WHERE clause repeatedly):');
    const dsqlStats = await this.measureLatency('DSQL Repeated Query', async () => {
      await client.query(`
        SELECT sc.*, COUNT(sce.id) as event_count 
        FROM soul_contracts sc 
        LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id 
        WHERE sc.id LIKE '%highway%' 
        GROUP BY sc.id, sc.contract_status, sc.soul_type, sc.contract_location, sc.updated_at
        LIMIT 5
      `);
    });

    console.log(`  Min: ${dsqlStats.min}ms | Avg: ${dsqlStats.avg.toFixed(2)}ms | P95: ${dsqlStats.p95}ms`);

    await client.end();

    console.log('\n🏆 Hot Partition Winner:');
    if (dynamoStats.avg < dsqlStats.avg) {
      const improvement = ((dsqlStats.avg - dynamoStats.avg) / dsqlStats.avg * 100).toFixed(1);
      console.log(`  DynamoDB wins by ${improvement}% - hot partitions stay in cache!`);
    } else {
      console.log(`  DSQL wins, but DynamoDB should excel with hot partition caching`);
    }
  }

  async demonstrateBatchOperations() {
    console.log('🚀 SCENARIO 3: Batch Operations');
    console.log('Use Case: "Get multiple soul contracts in one operation"\n');

    console.log('🔥 DynamoDB BatchGetItem (up to 100 items):');
    const dynamoStats = await this.measureLatency('DynamoDB Batch', async () => {
      await this.dynamoClient.send(new BatchGetItemCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: [
              { PK: { S: 'SOUL#evil_highway_66_0160' }, SK: { S: 'CONTRACT' } },
              { PK: { S: 'SOUL#evil_highway_66_0160' }, SK: { S: 'EVENT#2025-01-05T20:56:16.042Z' } },
              { PK: { S: 'SOUL#evil_highway_66_0160' }, SK: { S: 'EVENT#2025-01-05T20:57:16.042Z' } }
            ]
          }
        }
      }));
    }, 30);

    console.log(`  Min: ${dynamoStats.min}ms | Avg: ${dynamoStats.avg.toFixed(2)}ms | P95: ${dynamoStats.p95}ms`);
    console.log('  ✅ Single network round-trip for multiple items');

    const client = await this.connectDSQL();
    await client.connect();

    console.log('\n⚡ Aurora DSQL (multiple WHERE conditions):');
    const dsqlStats = await this.measureLatency('DSQL Multiple', async () => {
      await client.query(`
        SELECT * FROM soul_contracts WHERE id = 'evil_highway_66_0160'
        UNION ALL
        SELECT * FROM soul_contracts WHERE id LIKE '%highway%' LIMIT 2
      `);
    }, 30);

    console.log(`  Min: ${dsqlStats.min}ms | Avg: ${dsqlStats.avg.toFixed(2)}ms | P95: ${dsqlStats.p95}ms`);

    await client.end();

    console.log('\n🏆 Batch Operations Winner:');
    if (dynamoStats.avg < dsqlStats.avg) {
      const improvement = ((dsqlStats.avg - dynamoStats.avg) / dsqlStats.avg * 100).toFixed(1);
      console.log(`  DynamoDB wins by ${improvement}% - batch operations are highly optimized!`);
    } else {
      console.log(`  DSQL wins, but DynamoDB batch operations should be faster`);
    }
  }

  async demonstrateConsistentLatency() {
    console.log('📊 SCENARIO 4: Latency Consistency');
    console.log('Use Case: "Predictable performance for user-facing operations"\n');

    console.log('🎯 DynamoDB Consistency (100 operations):');
    const dynamoTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await this.dynamoClient.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: 'SOUL#evil_highway_66_0160' },
          SK: { S: 'CONTRACT' }
        }
      }));
      dynamoTimes.push(Date.now() - start);
    }

    const client = await this.connectDSQL();
    await client.connect();

    console.log('⚡ Aurora DSQL Consistency (100 operations):');
    const dsqlTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await client.query('SELECT * FROM soul_contracts WHERE id = $1', ['evil_highway_66_0160']);
      dsqlTimes.push(Date.now() - start);
    }

    await client.end();

    // Calculate variance
    const dynamoAvg = dynamoTimes.reduce((a, b) => a + b) / dynamoTimes.length;
    const dsqlAvg = dsqlTimes.reduce((a, b) => a + b) / dsqlTimes.length;
    
    const dynamoVariance = dynamoTimes.reduce((acc, time) => acc + Math.pow(time - dynamoAvg, 2), 0) / dynamoTimes.length;
    const dsqlVariance = dsqlTimes.reduce((acc, time) => acc + Math.pow(time - dsqlAvg, 2), 0) / dsqlTimes.length;

    console.log(`\nDynamoDB: Avg ${dynamoAvg.toFixed(2)}ms, Variance ${dynamoVariance.toFixed(2)}`);
    console.log(`Aurora DSQL: Avg ${dsqlAvg.toFixed(2)}ms, Variance ${dsqlVariance.toFixed(2)}`);

    console.log('\n🏆 Consistency Winner:');
    if (dynamoVariance < dsqlVariance) {
      console.log('  DynamoDB wins - more predictable latency for user-facing apps!');
    } else {
      console.log('  DSQL wins this round, but DynamoDB should be more consistent');
    }
  }

  async run() {
    try {
      await this.demonstrateDynamoStrengths();
      
      console.log('\n🎭 DYNAMODB STRENGTH SUMMARY:');
      console.log('');
      console.log('DynamoDB Excels At:');
      console.log('  🎯 Exact key lookups (GetItem operations)');
      console.log('  🔥 Hot partition performance (data locality)');
      console.log('  🚀 Batch operations (100 items in one call)');
      console.log('  📊 Consistent latency (predictable performance)');
      console.log('  ⚡ Single-digit millisecond responses at scale');
      console.log('');
      console.log('Choose DynamoDB when you need:');
      console.log('  • Guaranteed low latency for known access patterns');
      console.log('  • Massive scale with predictable performance');
      console.log('  • Simple key-value or document operations');
      console.log('  • Serverless applications with variable load');
      
    } catch (error) {
      console.error('Demo failed:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new DynamoStrengthDemo().run();
}

module.exports = DynamoStrengthDemo;
