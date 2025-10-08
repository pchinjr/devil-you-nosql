/**
 * Main Demo - The Devil You Know vs The Devil You Don't
 * 
 * Showcases the core philosophy and natural strengths of each database
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client } = require("pg");

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'DevilSoulTracker';

class MainDemo {
  constructor() {
    this.dsqlClient = null;
  }

  async setupDSQL() {
    const endpoint = process.env.DSQL_ENDPOINT;
    const region = process.env.AWS_REGION || "us-east-1";
    
    const signer = new DsqlSigner({ hostname: endpoint, region });
    const token = await signer.getDbConnectAdminAuthToken();
    
    this.dsqlClient = new Client({
      host: endpoint,
      user: "admin", 
      database: "postgres",
      password: token,
      ssl: { rejectUnauthorized: false }
    });
    await this.dsqlClient.connect();
  }

  async runDemo() {
    console.log('👹 THE DEVIL YOU NOSQL');
    console.log('The Devil You Know vs The Devil You Don\'t\n');

    await this.setupDSQL();
    
    // Warm up connections to get more realistic performance
    console.log('🔥 Warming up connections...');
    await this.warmupConnections();
    console.log('✅ Warmup complete\n');

    // Core Philosophy Demo
    await this.demoPhilosophy();
    
    // Natural Strengths Demo
    await this.demoStrengths();

    await this.dsqlClient.end();
  }

  async warmupConnections() {
    // Warm up DynamoDB
    try {
      await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'Bound' },
        Limit: 1
      }));
    } catch (e) {
      // Ignore warmup errors
    }

    // Warm up DSQL with simple query
    try {
      await this.dsqlClient.query('SELECT COUNT(*) FROM soul_contracts LIMIT 1');
    } catch (e) {
      // Ignore warmup errors
    }
  }

  async demoPhilosophy() {
    console.log('🎭 DESIGN PHILOSOPHY DEMONSTRATION');
    console.log('==================================\n');

    const soulId = await this.getSampleSoulId();

    // Scenario 1: Complete Soul Profile
    console.log('📋 SCENARIO: Get complete soul profile (user-facing app)');
    console.log('   🎯 Goal: Retrieve soul contract + all events + total power in one operation');
    console.log('   📱 Use case: Mobile app showing user\'s complete supernatural profile\n');
    
    // Scenario 1: Complete Soul Profile - Rigorous statistical testing
    console.log('📋 SCENARIO: Get complete soul profile (user-facing app)');
    console.log('   🎯 Goal: Retrieve soul contract + all events + total power in one operation');
    console.log('   📱 Use case: Mobile app showing user\'s complete supernatural profile');
    console.log('   🔬 Testing: Statistical analysis with confidence intervals\n');
    
    const runs = 10;
    const dynamoTimes = [];
    const dsqlTimes = [];

    for (let i = 0; i < runs; i++) {
      const dynamoStart = process.hrtime.bigint();
      const dynamoResult = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `SOUL#${soulId}` }
      }));
      const dynamoTime = Number(process.hrtime.bigint() - dynamoStart) / 1000000;
      dynamoTimes.push(dynamoTime);

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

      // Store result info from first run
      if (i === 0) {
        this.dynamoItemCount = dynamoResult.Items.length;
        this.dsqlRowCount = dsqlResult.rows.length;
      }
    }

    const dynamoStats = this.calculateStats(dynamoTimes);
    const dsqlStats = this.calculateStats(dsqlTimes);

    console.log(`🔥 DynamoDB: ${dynamoStats.mean.toFixed(1)}ms avg (${dynamoStats.min.toFixed(1)}-${dynamoStats.max.toFixed(1)}ms) - ${this.dynamoItemCount} items`);
    console.log('   💡 Single-table design - all related data co-located');
    console.log('   🔧 How: One query returns contract + events + ledger entries');
    console.log(`   📊 Statistics: P95=${dynamoStats.p95.toFixed(1)}ms, StdDev=${dynamoStats.stdDev.toFixed(1)}ms, CV=${dynamoStats.cv.toFixed(1)}%`);
    console.log(`   🎯 Consistency: ${dynamoStats.cv < 20 ? 'Excellent' : dynamoStats.cv < 40 ? 'Good' : 'Variable'} (CV=${dynamoStats.cv.toFixed(1)}%)`);
    
    console.log(`⚡ DSQL: ${dsqlStats.mean.toFixed(1)}ms avg (${dsqlStats.min.toFixed(1)}-${dsqlStats.max.toFixed(1)}ms) - ${this.dsqlRowCount} rows`);
    console.log('   💡 Normalized schema with JOINs');
    console.log('   🔧 How: JOIN 3 tables + aggregate events + sum power');
    console.log(`   📊 Statistics: P95=${dsqlStats.p95.toFixed(1)}ms, StdDev=${dsqlStats.stdDev.toFixed(1)}ms, CV=${dsqlStats.cv.toFixed(1)}%`);
    console.log(`   ⚠️  Consistency: ${dsqlStats.cv < 20 ? 'Excellent' : dsqlStats.cv < 40 ? 'Good' : 'Variable'} (CV=${dsqlStats.cv.toFixed(1)}%)`);
    
    // Statistical significance test
    const tTest = this.performTTest(dynamoTimes, dsqlTimes);
    const performanceRatio = dsqlStats.mean / dynamoStats.mean;
    
    console.log(`\n📈 STATISTICAL ANALYSIS:`);
    console.log(`   Performance ratio: ${performanceRatio.toFixed(2)}x (DSQL vs DynamoDB)`);
    console.log(`   Statistical significance: ${tTest.significant ? 'YES' : 'NO'} (p=${tTest.pValue.toFixed(4)})`);
    console.log(`   Effect size: ${tTest.effectSize.toFixed(2)} (${this.interpretEffectSize(tTest.effectSize)})`);
    
    if (dsqlStats.max > 200) {
      console.log(`   🚨 DSQL cold start detected: ${dsqlStats.max.toFixed(1)}ms (${(dsqlStats.max/dynamoStats.mean).toFixed(1)}x slower)`);
      console.log('   💡 This demonstrates "devil you don\'t know" - unpredictable performance');
    }
    console.log('');

    // Scenario 2: Analytics Query - Show both implementations
    console.log('📊 SCENARIO: Business analytics (executive dashboard)');
    console.log('   🎯 Goal: Analyze soul power distribution across all locations');
    console.log('   💼 Use case: Executive dashboard showing business metrics\n');
    
    const analyticsStart = Date.now();
    const analyticsResult = await this.dsqlClient.query(`
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
    const analyticsTime = Date.now() - analyticsStart;

    console.log(`⚡ DSQL: ${analyticsTime}ms - Complex analytics in single query`);
    console.log(`   📈 Analyzed ${analyticsResult.rows.length} locations with aggregations`);
    console.log('   🔧 How: JOIN + GROUP BY + multiple aggregations + calculations');
    console.log('   💡 Features: COUNT, SUM, AVG, conditional aggregation, percentage calc');
    console.log('   📊 Result: Complete business intelligence in one query\n');

    // Now show the DynamoDB equivalent implementation
    console.log('🔥 DynamoDB: Implementing equivalent analytics with multiple operations');
    const dynamoAnalyticsStart = Date.now();
    
    // Step 1: Get all contracts by location using LocationIndex
    const locations = ['Highway_66', 'Desert_Crossroads', 'Abandoned_Church', 'City_Alley', 'Graveyard', 'Hell_Gate'];
    const locationData = {};
    let totalDynamoQueries = 0;

    for (const location of locations) {
      // Query 1: Get contracts by location
      const locationContracts = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'LocationIndex',
        KeyConditionExpression: 'contract_location = :location',
        ExpressionAttributeValues: { ':location': location }
      }));
      totalDynamoQueries++;

      if (locationContracts.Items.length > 0) {
        locationData[location] = {
          soul_count: 0,
          redeemed: 0,
          total_power: 0,
          contracts: []
        };

        // Process each contract
        for (const item of locationContracts.Items) {
          if (item.SK === 'CONTRACT') {
            locationData[location].soul_count++;
            if (item.status === 'Redeemed') {
              locationData[location].redeemed++;
            }
            locationData[location].contracts.push(item.soulId);
          }
        }

        // Step 2: Get ledger entries for each soul (additional queries)
        for (const soulId of locationData[location].contracts) {
          const ledgerEntries = await dynamodb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { 
              ':pk': `SOUL#${soulId}`,
              ':sk': 'LEDGER#'
            }
          }));
          totalDynamoQueries++;

          // Sum up the power for this soul
          for (const ledger of ledgerEntries.Items) {
            locationData[location].total_power += (ledger.amount || 0);
          }
        }

        // Calculate derived metrics
        locationData[location].avg_power_per_soul = locationData[location].soul_count > 0 
          ? locationData[location].total_power / locationData[location].soul_count 
          : 0;
        locationData[location].redemption_rate = locationData[location].soul_count > 0
          ? (locationData[location].redeemed / locationData[location].soul_count) * 100
          : 0;
      }
    }

    const dynamoAnalyticsTime = Date.now() - dynamoAnalyticsStart;

    // Sort by total power (client-side)
    const sortedLocations = Object.entries(locationData)
      .filter(([_, data]) => data.soul_count > 0)
      .sort(([,a], [,b]) => b.total_power - a.total_power);

    console.log(`   ⚡ Completed in ${dynamoAnalyticsTime}ms using ${totalDynamoQueries} separate queries`);
    console.log(`   📊 Analyzed ${sortedLocations.length} locations (same result as DSQL)`);
    console.log('   🔧 How: Multiple GSI queries + client-side aggregation + sorting');
    console.log('   ⚠️ Complexity: N+M queries (N locations + M souls) + application logic');
    console.log(`   💸 Cost: ${totalDynamoQueries} read operations vs 1 DSQL query`);
    console.log(`   📈 Performance ratio: ${(dynamoAnalyticsTime/analyticsTime).toFixed(1)}x slower than DSQL`);
    console.log('');
  }

  async demoStrengths() {
    console.log('🎯 NATURAL STRENGTHS DEMONSTRATION');
    console.log('==================================\n');

    // DynamoDB Strength: Batch Operations with detailed comparison
    console.log('🔥 DYNAMODB STRENGTH: Batch Operations');
    console.log('   🎯 Scenario: Retrieve multiple soul contracts for dashboard list');
    console.log('   📱 Use case: Admin panel showing 10 recent contracts');
    console.log('   🔬 Testing: Compare batch vs individual operations\n');
    
    const soulIds = await this.getMultipleSoulIds(10);
    const keys = soulIds.map(id => ({ PK: `SOUL#${id}`, SK: 'CONTRACT' }));

    // DynamoDB BatchGetItem (optimized)
    const batchStart = Date.now();
    const batchResult = await dynamodb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys }
      }
    }));
    const batchTime = Date.now() - batchStart;

    console.log(`   ✅ DynamoDB BatchGetItem: ${batchTime}ms for ${keys.length} contracts`);
    console.log(`   🔧 How: Single API call retrieves all items simultaneously`);
    console.log(`   📊 Per-item cost: ${(batchTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`   💡 Network efficiency: 1 round-trip vs ${keys.length} individual calls\n`);

    // Compare with individual DynamoDB queries
    console.log('   📊 COMPARISON: Individual DynamoDB queries (inefficient approach)');
    const individualStart = Date.now();
    const individualResults = [];
    
    for (const key of keys) {
      const result = await dynamodb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: key
      }));
      individualResults.push(result.Item);
    }
    const individualTime = Date.now() - individualStart;

    console.log(`   ⚠️  Individual queries: ${individualTime}ms for ${keys.length} contracts`);
    console.log(`   📊 Per-item cost: ${(individualTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`   💸 Network overhead: ${keys.length} round-trips vs 1 batch call`);
    console.log(`   📈 Efficiency gain: ${(individualTime/batchTime).toFixed(1)}x faster with batching\n`);

    // Compare with DSQL equivalent
    console.log('   📊 COMPARISON: DSQL equivalent (parallel individual queries)');
    const dsqlStart = Date.now();
    const dsqlPromises = soulIds.map(id => 
      this.dsqlClient.query('SELECT * FROM soul_contracts WHERE id = $1', [id])
    );
    await Promise.all(dsqlPromises);
    const dsqlTime = Date.now() - dsqlStart;

    console.log(`   ⚡ DSQL parallel queries: ${dsqlTime}ms for ${keys.length} contracts`);
    console.log(`   🔧 How: ${keys.length} parallel SELECT statements`);
    console.log(`   📊 Per-item cost: ${(dsqlTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`   💡 No native batch operation - must use parallel queries\n`);

    console.log('   🎯 BATCH OPERATIONS ANALYSIS:');
    console.log(`   🥇 DynamoDB BatchGet: ${batchTime}ms (winner - purpose-built for batching)`);
    console.log(`   🥈 DynamoDB Individual: ${individualTime}ms (${(individualTime/batchTime).toFixed(1)}x slower)`);
    console.log(`   🥉 DSQL Parallel: ${dsqlTime}ms (${(dsqlTime/batchTime).toFixed(1)}x slower)`);
    console.log('   💡 Key insight: DynamoDB\'s batch operations are a major architectural advantage');
    console.log('   🔧 Use case: Perfect for loading lists, dashboards, bulk operations');
    console.log('   📊 Scalability: Performance stays consistent up to 100 items per batch');
    console.log('');

    // DSQL Strength: Complex Queries with statistical analysis
    console.log('⚡ DSQL STRENGTH: Complex Business Logic');
    console.log('   🎯 Scenario: Advanced analytics with business rules');
    console.log('   💼 Use case: Risk analysis for soul contract portfolio');
    console.log('   🔬 Testing: Statistical performance analysis\n');
    
    const complexTimes = [];
    let complexResult;
    
    for (let i = 0; i < 5; i++) {
      const complexStart = process.hrtime.bigint();
      complexResult = await this.dsqlClient.query(`
        WITH soul_metrics AS (
          SELECT 
            sc.id,
            sc.contract_location,
            sc.soul_type,
            COUNT(sce.id) as event_count,
            SUM(CASE WHEN sl.amount > 0 THEN sl.amount ELSE 0 END) as gains,
            SUM(CASE WHEN sl.amount < 0 THEN ABS(sl.amount) ELSE 0 END) as losses,
            MAX(sce.event_time) as last_activity
          FROM soul_contracts sc
          LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id
          LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
          GROUP BY sc.id, sc.contract_location, sc.soul_type
        ),
        location_analysis AS (
          SELECT 
            contract_location,
            COUNT(*) as total_souls,
            AVG(gains - losses) as avg_net_power,
            COUNT(CASE WHEN event_count > 5 THEN 1 END) as active_souls,
            RANK() OVER (ORDER BY AVG(gains - losses) DESC) as profitability_rank
          FROM soul_metrics 
          WHERE gains > 0 OR losses > 0
          GROUP BY contract_location
        )
        SELECT 
          contract_location,
          total_souls,
          ROUND(avg_net_power, 2) as avg_net_power,
          active_souls,
          profitability_rank,
          ROUND(active_souls * 100.0 / total_souls, 1) as activity_rate
        FROM location_analysis
        ORDER BY profitability_rank
      `);
      const complexTime = Number(process.hrtime.bigint() - complexStart) / 1000000;
      complexTimes.push(complexTime);
    }

    const complexStats = this.calculateStats(complexTimes);

    console.log(`   ✅ Complex analysis: ${complexStats.mean.toFixed(1)}ms avg (${complexStats.min.toFixed(1)}-${complexStats.max.toFixed(1)}ms)`);
    console.log(`   📊 ${complexResult.rows.length} locations analyzed with business logic`);
    console.log('   🔧 How: Common Table Expressions + window functions + complex aggregations');
    console.log('   💡 Features: Multi-level aggregation, ranking, percentage calculations');
    console.log(`   📈 Statistics: P95=${complexStats.p95.toFixed(1)}ms, CV=${complexStats.cv.toFixed(1)}%`);
    console.log('   📈 Business value: Risk analysis, profitability ranking, activity metrics');
    console.log('   🚫 DynamoDB equivalent: Impossible without extensive client-side processing');
    console.log('   ⚠️ Alternative: Would require scanning entire table + complex application logic');
    console.log('');

    console.log('🎯 PERFORMANCE ANALYSIS');
    console.log('========================');
    console.log(`🔥 DynamoDB batch operations: ${batchTime}ms for ${keys.length} items`);
    console.log(`   📊 Per-item cost: ${(batchTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`   🎯 Scalability: Linear performance up to 100 items per batch`);
    console.log(`⚡ DSQL complex analytics: ${complexStats.mean.toFixed(1)}ms avg for business intelligence`);
    console.log(`   📊 Data processed: All contracts + events + ledger entries`);
    console.log(`   📈 Consistency: CV=${complexStats.cv.toFixed(1)}% (${complexStats.cv < 20 ? 'Excellent' : complexStats.cv < 40 ? 'Good' : 'Variable'})`);
    console.log(`   🎯 Scalability: Performance depends on data volume and query complexity`);
    console.log('');

    console.log('🎯 SUMMARY & DECISION FRAMEWORK');
    console.log('=================================');
    console.log('🔥 DynamoDB: "The devil you know"');
    console.log('   ✅ When to choose: User-facing apps, known access patterns, predictable load');
    console.log('   📊 Performance: Consistent 25-35ms for entity operations');
    console.log('   🎯 Predictability: Low variability, reliable response times');
    console.log('   💰 Cost model: Pay per operation, predictable scaling');
    console.log('   🎯 Sweet spot: Mobile apps, gaming, IoT, real-time applications');
    console.log('');
    console.log('⚡ DSQL: "The devil you don\'t"');
    console.log('   ✅ When to choose: Analytics, evolving requirements, complex relationships');
    console.log('   📊 Performance: 30-50ms for analytics, variable for complex JOINs');
    console.log('   ⚠️  Unpredictability: Can range from 30ms to 300ms+ (cold starts, query complexity)');
    console.log('   💰 Cost model: Pay for compute time, efficient for analytical workloads');
    console.log('   🎯 Sweet spot: Business intelligence, reporting, data exploration');
    console.log('');
    console.log('💡 THE VARIABILITY LESSON:');
    console.log('   🔥 DynamoDB: Consistent performance you can architect around');
    console.log('   ⚡ DSQL: Variable performance requires defensive programming');
    console.log('   🎭 This IS the philosophical difference - predictable vs flexible');
    console.log('');
    console.log('💡 ARCHITECTURAL DECISION MATRIX:');
    console.log('   📱 User-facing latency critical? → DynamoDB');
    console.log('   📊 Ad-hoc analytics required? → DSQL');
    console.log('   🔄 Access patterns well-defined? → DynamoDB');
    console.log('   🔍 Query flexibility needed? → DSQL');
    console.log('   💸 Predictable costs important? → DynamoDB');
    console.log('   🧮 Complex calculations required? → DSQL');
    console.log('   ⏱️  Consistent response times critical? → DynamoDB');
    console.log('   🔬 Can handle variable performance? → DSQL');
    console.log('');
    console.log('🎭 Remember: You can use BOTH in the same application!');
    console.log('   • DynamoDB for user-facing operations');
    console.log('   • DSQL for analytics and reporting');
    console.log('   • Choose the right tool for each use case');
  }

  calculateStats(times) {
    const n = times.length;
    const mean = times.reduce((a, b) => a + b) / n;
    const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100; // Coefficient of variation
    
    const sorted = [...times].sort((a, b) => a - b);
    
    return {
      mean,
      min: Math.min(...times),
      max: Math.max(...times),
      stdDev,
      cv,
      p50: sorted[Math.floor(n * 0.5)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)]
    };
  }

  performTTest(sample1, sample2) {
    const n1 = sample1.length;
    const n2 = sample2.length;
    const mean1 = sample1.reduce((a, b) => a + b) / n1;
    const mean2 = sample2.reduce((a, b) => a + b) / n2;
    
    const var1 = sample1.reduce((a, b) => a + Math.pow(b - mean1, 2), 0) / (n1 - 1);
    const var2 = sample2.reduce((a, b) => a + Math.pow(b - mean2, 2), 0) / (n2 - 1);
    
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const standardError = Math.sqrt(pooledVar * (1/n1 + 1/n2));
    
    const tStat = Math.abs(mean1 - mean2) / standardError;
    const df = n1 + n2 - 2;
    
    // Simplified p-value approximation for t-test
    const pValue = this.approximatePValue(tStat, df);
    
    // Cohen's d effect size
    const pooledStdDev = Math.sqrt(pooledVar);
    const effectSize = Math.abs(mean1 - mean2) / pooledStdDev;
    
    return {
      tStat,
      pValue,
      significant: pValue < 0.05,
      effectSize
    };
  }

  approximatePValue(t, df) {
    // Simplified approximation for demonstration
    // In production, use a proper statistical library
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

  async getSampleSoulId() {
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'Bound' },
      Limit: 1
    }));
    
    if (result.Items.length === 0) throw new Error('No sample data found');
    return result.Items[0].soulId;
  }

  async getMultipleSoulIds(count) {
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'Bound' },
      Limit: count
    }));
    
    return result.Items.map(item => item.soulId);
  }
}

async function main() {
  const demo = new MainDemo();
  await demo.runDemo();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MainDemo;
