#!/usr/bin/env node

require('dotenv').config();
const { DynamoDBClient, QueryCommand, BatchGetItemCommand, TransactWriteItemsCommand } = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

const dynamodb = new DynamoDBClient({ region: AWS_REGION });

class BenchmarkSuite {
  constructor() {
    this.dsqlClient = null;
  }

  async connectDSQL() {
    const signer = new DsqlSigner({ 
      hostname: DSQL_ENDPOINT,
      region: AWS_REGION 
    });
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
    console.log('🏁 COMPREHENSIVE BENCHMARK SUITE');
    console.log('==================================');
    console.log('📊 Enhanced statistical analysis with larger sample sizes\n');

    await this.connectDSQL();
    await this.warmupConnections();

    // Get sample data for benchmarks
    const soulId = await this.getSampleSoulId();
    const multipleSoulIds = await this.getMultipleSoulIds(10);

    // Benchmark 1: User Profile Retrieval (100 iterations)
    await this.benchmarkUserProfiles(soulId, 100);

    // Benchmark 2: Analytics Queries (50 iterations)
    await this.benchmarkAnalytics(50);

    // Benchmark 3: Batch Operations (50 iterations)
    await this.benchmarkBatchOperations(multipleSoulIds, 50);

    // Benchmark 4: Write Operations (30 iterations)
    await this.benchmarkWriteOperations(soulId, 30);

    // Benchmark 5: Complex Analytics (25 iterations)
    await this.benchmarkComplexAnalytics(25);

    await this.dsqlClient.end();
    console.log('\n🎯 BENCHMARK COMPLETE - Enhanced statistical confidence achieved!');
  }

  async warmupConnections() {
    console.log('🔥 Warming up connections...');
    // DynamoDB warmup
    try {
      await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'WARMUP' },
        Limit: 1
      }));
    } catch (e) { /* ignore */ }

    // DSQL warmup
    try {
      await this.dsqlClient.query('SELECT 1 LIMIT 1');
    } catch (e) { /* ignore */ }
    
    console.log('✅ Warmup complete\n');
  }

  async benchmarkUserProfiles(soulId, iterations) {
    console.log(`📋 BENCHMARK 1: User Profile Retrieval (${iterations} iterations)`);
    console.log('   🎯 Scenario: Mobile app loading complete user profile');
    console.log('   📊 Enhanced sample size for robust statistical analysis\n');

    const dynamoTimes = [];
    const dsqlTimes = [];

    for (let i = 0; i < iterations; i++) {
      // DynamoDB query
      const dynamoStart = process.hrtime.bigint();
      const dynamoResult = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': { S: `SOUL#${soulId}` } }
      }));
      const dynamoTime = Number(process.hrtime.bigint() - dynamoStart) / 1000000;
      dynamoTimes.push(dynamoTime);

      // DSQL query
      const dsqlStart = process.hrtime.bigint();
      const dsqlResult = await this.dsqlClient.query(`
        SELECT sc.*,
               array_agg(sce.description) as events,
               sum(sl.amount) as total_power
        FROM soul_contracts sc
        LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id  
        LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        WHERE sc.id = $1
        GROUP BY sc.id, sc.contract_status, sc.soul_type, sc.contract_location, sc.updated_at
      `, [soulId]);
      const dsqlTime = Number(process.hrtime.bigint() - dsqlStart) / 1000000;
      dsqlTimes.push(dsqlTime);

      // Progress indicator
      if ((i + 1) % 20 === 0) {
        console.log(`   Progress: ${i + 1}/${iterations} iterations completed`);
      }
    }

    const dynamoStats = this.calculateAdvancedStats(dynamoTimes);
    const dsqlStats = this.calculateAdvancedStats(dsqlTimes);
    const tTest = this.performTTest(dynamoTimes, dsqlTimes);

    console.log(`\n📊 USER PROFILE RESULTS (${iterations} samples):`);
    console.log(`🔥 DynamoDB: ${dynamoStats.mean.toFixed(1)}ms ± ${dynamoStats.ci95.toFixed(1)}ms`);
    console.log(`   Range: ${dynamoStats.min.toFixed(1)}-${dynamoStats.max.toFixed(1)}ms`);
    console.log(`   P50: ${dynamoStats.p50.toFixed(1)}ms, P95: ${dynamoStats.p95.toFixed(1)}ms, P99: ${dynamoStats.p99.toFixed(1)}ms`);
    console.log(`   CV: ${dynamoStats.cv.toFixed(1)}% (${this.interpretConsistency(dynamoStats.cv)})`);
    
    console.log(`⚡ DSQL: ${dsqlStats.mean.toFixed(1)}ms ± ${dsqlStats.ci95.toFixed(1)}ms`);
    console.log(`   Range: ${dsqlStats.min.toFixed(1)}-${dsqlStats.max.toFixed(1)}ms`);
    console.log(`   P50: ${dsqlStats.p50.toFixed(1)}ms, P95: ${dsqlStats.p95.toFixed(1)}ms, P99: ${dsqlStats.p99.toFixed(1)}ms`);
    console.log(`   CV: ${dsqlStats.cv.toFixed(1)}% (${this.interpretConsistency(dsqlStats.cv)})`);

    console.log(`\n📈 STATISTICAL ANALYSIS:`);
    console.log(`   Performance ratio: ${(dsqlStats.mean / dynamoStats.mean).toFixed(2)}x`);
    console.log(`   Statistical significance: ${tTest.significant ? 'YES' : 'NO'} (p=${tTest.pValue.toFixed(4)})`);
    console.log(`   Effect size: ${tTest.effectSize.toFixed(2)} (${this.interpretEffectSize(tTest.effectSize)})`);
    console.log(`   Confidence: ${iterations >= 100 ? 'HIGH' : iterations >= 50 ? 'MEDIUM' : 'LOW'} (n=${iterations})`);
  }

  async benchmarkAnalytics(iterations) {
    console.log(`\n📊 BENCHMARK 2: Business Analytics (${iterations} iterations)`);
    console.log('   🎯 Scenario: Executive dashboard loading business metrics');
    console.log('   📈 Comparing single SQL query vs multiple DynamoDB operations\n');

    const dsqlTimes = [];
    const dynamoTimes = [];

    for (let i = 0; i < iterations; i++) {
      // DSQL analytics query
      const dsqlStart = Date.now();
      await this.dsqlClient.query(`
        SELECT 
          sc.contract_location,
          COUNT(*) as soul_count,
          COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) as redeemed,
          SUM(COALESCE(sl.amount, 0)) as total_power,
          AVG(COALESCE(sl.amount, 0)) as avg_power_per_soul,
          ROUND(COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) * 100.0 / COUNT(*), 1) as redemption_rate
        FROM soul_contracts sc
        LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        GROUP BY sc.contract_location
        ORDER BY total_power DESC
      `);
      const dsqlTime = Date.now() - dsqlStart;
      dsqlTimes.push(dsqlTime);

      // DynamoDB equivalent (simplified for benchmark)
      const dynamoStart = Date.now();
      const locations = ['Highway_66', 'Desert_Crossroads', 'Abandoned_Church', 'City_Alley', 'Graveyard', 'Hell_Gate'];
      for (const location of locations) {
        await dynamodb.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'LocationIndex',
          KeyConditionExpression: 'contract_location = :location',
          ExpressionAttributeValues: { ':location': { S: location } }
        }));
      }
      const dynamoTime = Date.now() - dynamoStart;
      dynamoTimes.push(dynamoTime);

      if ((i + 1) % 10 === 0) {
        console.log(`   Progress: ${i + 1}/${iterations} iterations completed`);
      }
    }

    const dsqlStats = this.calculateAdvancedStats(dsqlTimes);
    const dynamoStats = this.calculateAdvancedStats(dynamoTimes);

    console.log(`\n📊 ANALYTICS RESULTS (${iterations} samples):`);
    console.log(`⚡ DSQL: ${dsqlStats.mean.toFixed(1)}ms ± ${dsqlStats.ci95.toFixed(1)}ms`);
    console.log(`   P95: ${dsqlStats.p95.toFixed(1)}ms, CV: ${dsqlStats.cv.toFixed(1)}%`);
    console.log(`🔥 DynamoDB: ${dynamoStats.mean.toFixed(1)}ms ± ${dynamoStats.ci95.toFixed(1)}ms`);
    console.log(`   P95: ${dynamoStats.p95.toFixed(1)}ms, CV: ${dynamoStats.cv.toFixed(1)}%`);
    console.log(`📈 Performance ratio: ${(dynamoStats.mean / dsqlStats.mean).toFixed(1)}x slower (DynamoDB)`);
  }

  async benchmarkBatchOperations(soulIds, iterations) {
    console.log(`\n🔥 BENCHMARK 3: Batch Operations (${iterations} iterations)`);
    console.log('   🎯 Scenario: Admin dashboard loading multiple contracts');
    console.log('   📦 Comparing batch APIs vs individual queries\n');

    const dynamoBatchTimes = [];
    const dsqlBatchTimes = [];
    const dynamoIndividualTimes = [];

    for (let i = 0; i < iterations; i++) {
      // DynamoDB BatchGet
      const dynamoBatchStart = Date.now();
      await dynamodb.send(new BatchGetItemCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: soulIds.slice(0, 8).map(id => ({
              PK: { S: `SOUL#${id}` },
              SK: { S: 'CONTRACT' }
            }))
          }
        }
      }));
      const dynamoBatchTime = Date.now() - dynamoBatchStart;
      dynamoBatchTimes.push(dynamoBatchTime);

      // DSQL batch with IN clause
      const dsqlBatchStart = Date.now();
      await this.dsqlClient.query(
        'SELECT * FROM soul_contracts WHERE id = ANY($1::text[])',
        [soulIds.slice(0, 8)]
      );
      const dsqlBatchTime = Date.now() - dsqlBatchStart;
      dsqlBatchTimes.push(dsqlBatchTime);

      // DynamoDB individual queries (for comparison)
      const dynamoIndividualStart = Date.now();
      for (const soulId of soulIds.slice(0, 8)) {
        await dynamodb.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': { S: `SOUL#${soulId}` },
            ':sk': { S: 'CONTRACT' }
          }
        }));
      }
      const dynamoIndividualTime = Date.now() - dynamoIndividualStart;
      dynamoIndividualTimes.push(dynamoIndividualTime);

      if ((i + 1) % 10 === 0) {
        console.log(`   Progress: ${i + 1}/${iterations} iterations completed`);
      }
    }

    const dynamoBatchStats = this.calculateAdvancedStats(dynamoBatchTimes);
    const dsqlBatchStats = this.calculateAdvancedStats(dsqlBatchTimes);
    const dynamoIndividualStats = this.calculateAdvancedStats(dynamoIndividualTimes);

    console.log(`\n📦 BATCH OPERATIONS RESULTS (${iterations} samples):`);
    console.log(`🥇 DSQL IN clause: ${dsqlBatchStats.mean.toFixed(1)}ms ± ${dsqlBatchStats.ci95.toFixed(1)}ms`);
    console.log(`🥈 DynamoDB BatchGet: ${dynamoBatchStats.mean.toFixed(1)}ms ± ${dynamoBatchStats.ci95.toFixed(1)}ms`);
    console.log(`🥉 DynamoDB Individual: ${dynamoIndividualStats.mean.toFixed(1)}ms ± ${dynamoIndividualStats.ci95.toFixed(1)}ms`);
    console.log(`📈 Batch efficiency: ${(dynamoIndividualStats.mean / dynamoBatchStats.mean).toFixed(1)}x faster`);
  }

  async benchmarkWriteOperations(soulId, iterations) {
    console.log(`\n✍️  BENCHMARK 4: Write Operations (${iterations} iterations)`);
    console.log('   🎯 Scenario: Transaction processing for soul contract updates');
    console.log('   💾 Comparing transaction performance and consistency\n');

    const dynamoTimes = [];
    const dsqlTimes = [];

    for (let i = 0; i < iterations; i++) {
      const timestamp = new Date().toISOString();
      const amount = Math.floor(Math.random() * 1000) + 100;

      // DynamoDB transaction
      const dynamoStart = Date.now();
      try {
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
                ExpressionAttributeValues: { ':timestamp': { S: timestamp } }
              }
            },
            {
              Put: {
                TableName: TABLE_NAME,
                Item: {
                  PK: { S: `SOUL#${soulId}` },
                  SK: { S: `EVENT#${timestamp}` },
                  description: { S: `Benchmark event ${i}` },
                  timestamp: { S: timestamp }
                }
              }
            }
          ]
        }));
        const dynamoTime = Date.now() - dynamoStart;
        dynamoTimes.push(dynamoTime);
      } catch (error) {
        console.log(`   ⚠️ DynamoDB transaction ${i} failed: ${error.message}`);
      }

      // DSQL transaction
      const dsqlStart = Date.now();
      try {
        await this.dsqlClient.query('BEGIN');
        await this.dsqlClient.query(
          'UPDATE soul_contracts SET updated_at = $1 WHERE id = $2',
          [timestamp, soulId]
        );
        await this.dsqlClient.query(
          'INSERT INTO soul_contract_events (soul_contract_id, description, event_time) VALUES ($1, $2, $3)',
          [soulId, `Benchmark event ${i}`, timestamp]
        );
        await this.dsqlClient.query('COMMIT');
        const dsqlTime = Date.now() - dsqlStart;
        dsqlTimes.push(dsqlTime);
      } catch (error) {
        await this.dsqlClient.query('ROLLBACK');
        console.log(`   ⚠️ DSQL transaction ${i} failed: ${error.message}`);
      }

      if ((i + 1) % 10 === 0) {
        console.log(`   Progress: ${i + 1}/${iterations} iterations completed`);
      }
    }

    const dynamoStats = this.calculateAdvancedStats(dynamoTimes);
    const dsqlStats = this.calculateAdvancedStats(dsqlTimes);

    console.log(`\n💾 WRITE OPERATIONS RESULTS (${iterations} samples):`);
    if (dynamoTimes.length > 0) {
      console.log(`🔥 DynamoDB: ${dynamoStats.mean.toFixed(1)}ms ± ${dynamoStats.ci95.toFixed(1)}ms`);
      console.log(`   P95: ${dynamoStats.p95.toFixed(1)}ms, CV: ${dynamoStats.cv.toFixed(1)}% (${this.interpretConsistency(dynamoStats.cv)})`);
    } else {
      console.log(`🔥 DynamoDB: No successful transactions (all failed)`);
    }
    
    if (dsqlTimes.length > 0) {
      console.log(`⚡ DSQL: ${dsqlStats.mean.toFixed(1)}ms ± ${dsqlStats.ci95.toFixed(1)}ms`);
      console.log(`   P95: ${dsqlStats.p95.toFixed(1)}ms, CV: ${dsqlStats.cv.toFixed(1)}% (${this.interpretConsistency(dsqlStats.cv)})`);
      console.log(`📈 Consistency winner: ${dynamoStats.cv < dsqlStats.cv ? 'DynamoDB' : 'DSQL'}`);
    } else {
      console.log(`⚡ DSQL: No successful transactions (all failed)`);
    }
  }

  async benchmarkComplexAnalytics(iterations) {
    console.log(`\n⚡ BENCHMARK 5: Complex Analytics (${iterations} iterations)`);
    console.log('   🎯 Scenario: Advanced business intelligence queries');
    console.log('   🧮 Testing DSQL\'s analytical capabilities\n');

    const complexTimes = [];

    for (let i = 0; i < iterations; i++) {
      const complexStart = Date.now();
      await this.dsqlClient.query(`
        WITH location_stats AS (
          SELECT 
            sc.contract_location,
            COUNT(*) as total_contracts,
            COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) as redeemed_count,
            AVG(COALESCE(sl.amount, 0)) as avg_power
          FROM soul_contracts sc
          LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
          GROUP BY sc.contract_location
        )
        SELECT 
          contract_location,
          total_contracts,
          redeemed_count,
          ROUND(redeemed_count * 100.0 / total_contracts, 1) as redemption_rate,
          ROUND(avg_power, 2) as avg_net_power,
          RANK() OVER (ORDER BY avg_power DESC) as profitability_rank,
          CASE 
            WHEN redeemed_count > 0 THEN 100.0
            ELSE 0.0
          END as activity_rate
        FROM location_stats
        ORDER BY profitability_rank
      `);
      const complexTime = Date.now() - complexStart;
      complexTimes.push(complexTime);

      if ((i + 1) % 5 === 0) {
        console.log(`   Progress: ${i + 1}/${iterations} iterations completed`);
      }
    }

    const complexStats = this.calculateAdvancedStats(complexTimes);

    console.log(`\n🧮 COMPLEX ANALYTICS RESULTS (${iterations} samples):`);
    console.log(`⚡ DSQL: ${complexStats.mean.toFixed(1)}ms ± ${complexStats.ci95.toFixed(1)}ms`);
    console.log(`   P95: ${complexStats.p95.toFixed(1)}ms, CV: ${complexStats.cv.toFixed(1)}%`);
    console.log(`   🚫 DynamoDB equivalent: Would require extensive client-side processing`);
    console.log(`   💡 Demonstrates DSQL's strength in analytical workloads`);
  }

  calculateAdvancedStats(times) {
    if (times.length === 0) {
      return {
        mean: 0,
        min: 0,
        max: 0,
        stdDev: 0,
        cv: 0,
        ci95: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = times.sort((a, b) => a - b);
    const n = times.length;
    const mean = times.reduce((a, b) => a + b, 0) / n;
    const variance = times.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100;
    
    // Confidence interval (95%)
    const tValue = 1.96; // Approximate for large samples
    const ci95 = (tValue * stdDev) / Math.sqrt(n);
    
    return {
      mean,
      min: Math.min(...times),
      max: Math.max(...times),
      stdDev,
      cv,
      ci95,
      p50: sorted[Math.floor(n * 0.5)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)]
    };
  }

  performTTest(sample1, sample2) {
    const n1 = sample1.length;
    const n2 = sample2.length;
    const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
    const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;
    
    const var1 = sample1.reduce((acc, val) => acc + Math.pow(val - mean1, 2), 0) / (n1 - 1);
    const var2 = sample2.reduce((acc, val) => acc + Math.pow(val - mean2, 2), 0) / (n2 - 1);
    
    const pooledStdDev = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
    const tStat = Math.abs(mean1 - mean2) / (pooledStdDev * Math.sqrt(1/n1 + 1/n2));
    const df = n1 + n2 - 2;
    const pValue = this.approximatePValue(tStat, df);
    const effectSize = Math.abs(mean1 - mean2) / pooledStdDev;
    
    return {
      tStat,
      pValue,
      significant: pValue < 0.05,
      effectSize
    };
  }

  approximatePValue(t, df) {
    if (t > 3) return 0.001;
    if (t > 2.5) return 0.01;
    if (t > 2) return 0.05;
    if (t > 1.5) return 0.1;
    return 0.2;
  }

  interpretEffectSize(d) {
    if (d < 0.2) return 'negligible';
    if (d < 0.5) return 'small';
    if (d < 0.8) return 'medium';
    return 'large';
  }

  interpretConsistency(cv) {
    if (cv < 20) return 'Excellent';
    if (cv < 40) return 'Good';
    if (cv < 60) return 'Variable';
    return 'Highly Variable';
  }

  async getSampleSoulId() {
    const dynamoResult = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': { S: 'Bound' } },
      Limit: 10
    }));
    
    if (dynamoResult.Items.length === 0) throw new Error('No sample data found');
    
    // Find a soul that exists in both databases
    for (const item of dynamoResult.Items) {
      const soulId = item.soulId.S;
      try {
        const dsqlCheck = await this.dsqlClient.query('SELECT id FROM soul_contracts WHERE id = $1', [soulId]);
        if (dsqlCheck.rows.length > 0) {
          return soulId;
        }
      } catch (error) {
        continue;
      }
    }
    
    return dynamoResult.Items[0].soulId.S;
  }

  async getMultipleSoulIds(count) {
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': { S: 'Bound' } },
      Limit: count
    }));
    
    return result.Items.map(item => item.soulId.S);
  }
}

// Run the benchmark
async function main() {
  const benchmark = new BenchmarkSuite();
  await benchmark.runBenchmark();
}

main().catch(console.error);
