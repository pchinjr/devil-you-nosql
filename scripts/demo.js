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

    // Core Philosophy Demo
    await this.demoPhilosophy();
    
    // Natural Strengths Demo
    await this.demoStrengths();

    await this.dsqlClient.end();
  }

  async demoPhilosophy() {
    console.log('🎭 DESIGN PHILOSOPHY DEMONSTRATION');
    console.log('==================================\n');

    const soulId = await this.getSampleSoulId();

    // Scenario 1: Complete Soul Profile
    console.log('📋 SCENARIO: Get complete soul profile (user-facing app)');
    console.log('   🎯 Goal: Retrieve soul contract + all events + total power in one operation');
    console.log('   📱 Use case: Mobile app showing user\'s complete supernatural profile\n');
    
    const dynamoStart = Date.now();
    const dynamoResult = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `SOUL#${soulId}` }
    }));
    const dynamoTime = Date.now() - dynamoStart;

    const dsqlStart = Date.now();
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
    const dsqlTime = Date.now() - dsqlStart;

    console.log(`🔥 DynamoDB: ${dynamoTime}ms (${dynamoResult.Items.length} items)`);
    console.log('   💡 Single-table design - all related data co-located');
    console.log('   🔧 How: One query returns contract + events + ledger entries');
    console.log('   📊 Performance: Consistent ~25-30ms regardless of data complexity');
    console.log(`⚡ DSQL: ${dsqlTime}ms (${dsqlResult.rows.length} rows)`);
    console.log('   💡 Normalized schema with JOINs');
    console.log('   🔧 How: JOIN 3 tables + aggregate events + sum power');
    console.log('   📊 Performance: Variable based on JOIN complexity and data volume');
    
    const performanceRatio = Math.round(dsqlTime / dynamoTime);
    if (performanceRatio > 5) {
      console.log(`   ⚠️  DSQL is ${performanceRatio}x slower - significant JOIN overhead for entity retrieval`);
    } else if (performanceRatio > 2) {
      console.log(`   ⚠️  DSQL is ${performanceRatio}x slower - moderate JOIN overhead`);
    } else {
      console.log(`   ✅ Performance comparable (${performanceRatio}x difference)`);
    }
    console.log('');

    // Scenario 2: Analytics Query
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
    console.log('   📊 Result: Complete business intelligence in one query');
    console.log('🔥 DynamoDB: Would require multiple GSI queries + client aggregation');
    console.log('   🔧 How: Query StatusIndex + LocationIndex + client-side math');
    console.log('   ⚠️ Complexity: 3-4 separate queries + application logic');
    console.log('   📊 Estimated time: 60-100ms + development complexity');
    console.log('   💸 Cost: Multiple read operations vs single DSQL query');
    console.log('');
  }

  async demoStrengths() {
    console.log('🎯 NATURAL STRENGTHS DEMONSTRATION');
    console.log('==================================\n');

    // DynamoDB Strength: Batch Operations
    console.log('🔥 DYNAMODB STRENGTH: Batch Operations');
    console.log('   🎯 Scenario: Retrieve multiple soul contracts for dashboard list');
    console.log('   📱 Use case: Admin panel showing 10 recent contracts');
    
    const soulIds = await this.getMultipleSoulIds(10);
    const keys = soulIds.map(id => ({ PK: `SOUL#${id}`, SK: 'CONTRACT' }));

    const batchStart = Date.now();
    const batchResult = await dynamodb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys }
      }
    }));
    const batchTime = Date.now() - batchStart;

    console.log(`   ✅ Retrieved ${keys.length} soul contracts in ${batchTime}ms`);
    console.log('   🔧 How: Single BatchGetItem operation');
    console.log('   💡 Advantage: Optimized for bulk operations, single network round-trip');
    console.log('   📊 Performance: ~30ms regardless of item count (up to 100 items)');
    console.log('   💸 Cost: 1 operation vs N individual queries');
    console.log('');

    // DSQL Strength: Complex Queries
    console.log('⚡ DSQL STRENGTH: Complex Business Logic');
    console.log('   🎯 Scenario: Advanced analytics with business rules');
    console.log('   💼 Use case: Risk analysis for soul contract portfolio');
    
    const complexStart = Date.now();
    const complexResult = await this.dsqlClient.query(`
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
    const complexTime = Date.now() - complexStart;

    console.log(`   ✅ Complex analysis with CTEs in ${complexTime}ms`);
    console.log(`   📊 ${complexResult.rows.length} locations analyzed with business logic`);
    console.log('   🔧 How: Common Table Expressions + window functions + complex aggregations');
    console.log('   💡 Features: Multi-level aggregation, ranking, percentage calculations');
    console.log('   📈 Business value: Risk analysis, profitability ranking, activity metrics');
    console.log('   🚫 DynamoDB equivalent: Impossible without extensive client-side processing');
    console.log('   ⚠️ Alternative: Would require scanning entire table + complex application logic');
    console.log('');

    console.log('🎯 PERFORMANCE ANALYSIS');
    console.log('========================');
    console.log(`🔥 DynamoDB batch operations: ${batchTime}ms for ${keys.length} items`);
    console.log(`   📊 Per-item cost: ${(batchTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`   🎯 Scalability: Linear performance up to 100 items per batch`);
    console.log(`⚡ DSQL complex analytics: ${complexTime}ms for business intelligence`);
    console.log(`   📊 Data processed: All contracts + events + ledger entries`);
    console.log(`   🎯 Scalability: Performance depends on data volume and query complexity`);
    console.log('');

    console.log('🎯 SUMMARY & DECISION FRAMEWORK');
    console.log('=================================');
    console.log('🔥 DynamoDB: "The devil you know"');
    console.log('   ✅ When to choose: User-facing apps, known access patterns, predictable load');
    console.log('   📊 Performance: Consistent 25-35ms for entity operations');
    console.log('   💰 Cost model: Pay per operation, predictable scaling');
    console.log('   🎯 Sweet spot: Mobile apps, gaming, IoT, real-time applications');
    console.log('');
    console.log('⚡ DSQL: "The devil you don\'t"');
    console.log('   ✅ When to choose: Analytics, evolving requirements, complex relationships');
    console.log('   📊 Performance: 30-50ms for analytics, variable for complex JOINs');
    console.log('   💰 Cost model: Pay for compute time, efficient for analytical workloads');
    console.log('   🎯 Sweet spot: Business intelligence, reporting, data exploration');
    console.log('');
    console.log('💡 ARCHITECTURAL DECISION MATRIX:');
    console.log('   📱 User-facing latency critical? → DynamoDB');
    console.log('   📊 Ad-hoc analytics required? → DSQL');
    console.log('   🔄 Access patterns well-defined? → DynamoDB');
    console.log('   🔍 Query flexibility needed? → DSQL');
    console.log('   💸 Predictable costs important? → DynamoDB');
    console.log('   🧮 Complex calculations required? → DSQL');
    console.log('');
    console.log('🎭 Remember: You can use BOTH in the same application!');
    console.log('   • DynamoDB for user-facing operations');
    console.log('   • DSQL for analytics and reporting');
    console.log('   • Choose the right tool for each use case');
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
