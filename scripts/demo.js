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
    console.log(`⚡ DSQL: ${dsqlTime}ms (${dsqlResult.rows.length} rows)`);
    console.log('   💡 Normalized schema with JOINs\n');

    // Scenario 2: Analytics Query
    console.log('📊 SCENARIO: Business analytics (executive dashboard)');
    
    const analyticsStart = Date.now();
    const analyticsResult = await this.dsqlClient.query(`
      SELECT 
        sc.contract_location,
        COUNT(*) as soul_count,
        COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) as redeemed,
        SUM(COALESCE(sl.amount, 0)) as total_power
      FROM soul_contracts sc
      LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
      GROUP BY sc.contract_location
      ORDER BY total_power DESC
    `);
    const analyticsTime = Date.now() - analyticsStart;

    console.log(`⚡ DSQL: ${analyticsTime}ms - Complex analytics in single query`);
    console.log(`   📈 Analyzed ${analyticsResult.rows.length} locations with aggregations`);
    console.log('🔥 DynamoDB: Would require multiple GSI queries + client aggregation');
    console.log('   ⚠️ Complex for ad-hoc analytics\n');
  }

  async demoStrengths() {
    console.log('🎯 NATURAL STRENGTHS DEMONSTRATION');
    console.log('==================================\n');

    // DynamoDB Strength: Batch Operations
    console.log('🔥 DYNAMODB STRENGTH: Batch Operations');
    const soulIds = await this.getMultipleSoulIds(10);
    const keys = soulIds.map(id => ({ PK: `SOUL#${id}`, SK: 'CONTRACT' }));

    const batchStart = Date.now();
    await dynamodb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys }
      }
    }));
    const batchTime = Date.now() - batchStart;

    console.log(`   ✅ Retrieved ${keys.length} soul contracts in ${batchTime}ms`);
    console.log('   💡 Optimized for bulk operations\n');

    // DSQL Strength: Complex Queries
    console.log('⚡ DSQL STRENGTH: Complex Business Logic');
    const complexStart = Date.now();
    const complexResult = await this.dsqlClient.query(`
      WITH soul_metrics AS (
        SELECT 
          sc.id,
          sc.contract_location,
          COUNT(sce.id) as event_count,
          SUM(CASE WHEN sl.amount > 0 THEN sl.amount ELSE 0 END) as gains
        FROM soul_contracts sc
        LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id
        LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        GROUP BY sc.id, sc.contract_location
      )
      SELECT contract_location, AVG(gains) as avg_gains
      FROM soul_metrics 
      WHERE event_count > 5
      GROUP BY contract_location
      ORDER BY avg_gains DESC
    `);
    const complexTime = Date.now() - complexStart;

    console.log(`   ✅ Complex analysis with CTEs in ${complexTime}ms`);
    console.log(`   📊 ${complexResult.rows.length} locations analyzed`);
    console.log('   💡 Impossible to replicate in DynamoDB natively\n');

    console.log('🎯 SUMMARY');
    console.log('==========');
    console.log('🔥 DynamoDB: "The devil you know"');
    console.log('   • Predictable performance for known patterns');
    console.log('   • Excellent for user-facing applications');
    console.log('   • Optimized batch operations');
    console.log('');
    console.log('⚡ DSQL: "The devil you don\'t"');
    console.log('   • Flexible for any query you can imagine');
    console.log('   • Perfect for analytics and business intelligence');
    console.log('   • Rich SQL capabilities (CTEs, window functions)');
    console.log('');
    console.log('💡 Choose your devil wisely based on your use case!');
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
