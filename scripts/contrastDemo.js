/**
 * Contrast Demo - Show Each Database's Natural Strengths
 * 
 * DynamoDB Scenarios: Where it naturally excels
 * DSQL Scenarios: Where it naturally excels
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client } = require("pg");

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'DevilSoulTracker';

class ContrastDemo {
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
    console.log('🎭 DATABASE CONTRAST DEMONSTRATION');
    console.log('Showcasing natural strengths for compelling narrative\n');

    await this.setupDSQL();

    // DynamoDB's sweet spots
    await this.demoUserFacingOperations();
    await this.demoBatchOperations();
    await this.demoKnownAccessPatterns();

    // DSQL's sweet spots  
    await this.demoAdHocAnalytics();
    await this.demoComplexRelationships();
    await this.demoBusinessIntelligence();

    await this.dsqlClient.end();
  }

  async demoUserFacingOperations() {
    console.log('🔥 DYNAMODB STRENGTH: User-Facing Operations');
    console.log('Scenario: Mobile app needs instant soul profile lookup\n');

    const soulId = await this.getSampleSoulId();
    
    const start = Date.now();
    
    // Single query gets complete user profile
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `SOUL#${soulId}` },
      ConsistentRead: true
    }));

    const duration = Date.now() - start;
    
    console.log(`✅ Retrieved complete soul profile in ${duration}ms`);
    console.log(`📊 Items returned: ${result.Items.length}`);
    console.log('🎯 Perfect for: Mobile apps, user dashboards, real-time lookups');
    console.log('💡 Why DynamoDB wins: Single-table design, predictable performance\n');
  }

  async demoBatchOperations() {
    console.log('🔥 DYNAMODB STRENGTH: Batch Operations');
    console.log('Scenario: Load balancer needs to check 25 soul statuses simultaneously\n');

    const soulIds = await this.getMultipleSoulIds(25);
    
    const keys = soulIds.map(id => ({
      PK: `SOUL#${id}`,
      SK: 'CONTRACT'
    }));

    const start = Date.now();
    
    const result = await dynamodb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keys,
          ConsistentRead: true
        }
      }
    }));

    const duration = Date.now() - start;
    
    console.log(`✅ Retrieved ${result.Responses[TABLE_NAME].length} soul contracts in ${duration}ms`);
    console.log('🎯 Perfect for: Microservices, batch processing, high-throughput APIs');
    console.log('💡 Why DynamoDB wins: Optimized batch operations, parallel processing\n');
  }

  async demoKnownAccessPatterns() {
    console.log('🔥 DYNAMODB STRENGTH: Known Access Patterns');
    console.log('Scenario: Dashboard needs "condemned souls at graveyards" (designed query)\n');

    const start = Date.now();
    
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      FilterExpression: 'contract_location = :location',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { 
        ':status': 'Condemned',
        ':location': 'Graveyard'
      }
    }));

    const duration = Date.now() - start;
    
    console.log(`✅ Found ${result.Items.length} condemned souls at graveyards in ${duration}ms`);
    console.log('🎯 Perfect for: Designed dashboards, known reports, predictable queries');
    console.log('💡 Why DynamoDB wins: GSI optimization, O(1) performance for designed patterns\n');
  }

  async demoAdHocAnalytics() {
    console.log('⚡ DSQL STRENGTH: Ad-Hoc Analytics');
    console.log('Scenario: CEO asks "What\'s our soul power ROI by location and redemption rate?"\n');

    const start = Date.now();
    
    const result = await this.dsqlClient.query(`
      SELECT 
        sc.contract_location,
        COUNT(*) as total_souls,
        COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) as redeemed_count,
        ROUND(COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) * 100.0 / COUNT(*), 2) as redemption_rate,
        SUM(COALESCE(sl.amount, 0)) as total_power,
        ROUND(AVG(COALESCE(sl.amount, 0)), 2) as avg_power_per_soul
      FROM soul_contracts sc
      LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
      GROUP BY sc.contract_location
      HAVING COUNT(*) > 5
      ORDER BY redemption_rate DESC, total_power DESC
    `);

    const duration = Date.now() - start;
    
    console.log(`✅ Generated executive analytics in ${duration}ms`);
    console.log(`📊 Locations analyzed: ${result.rows.length}`);
    console.log('🎯 Perfect for: Executive dashboards, business intelligence, exploratory analysis');
    console.log('💡 Why DSQL wins: No schema changes needed, complex aggregations in single query\n');
  }

  async demoComplexRelationships() {
    console.log('⚡ DSQL STRENGTH: Complex Relationships');
    console.log('Scenario: Audit team needs "souls with suspicious transaction patterns"\n');

    const start = Date.now();
    
    const result = await this.dsqlClient.query(`
      WITH soul_stats AS (
        SELECT 
          sc.id,
          sc.soul_type,
          sc.contract_status,
          COUNT(sl.id) as transaction_count,
          SUM(CASE WHEN sl.amount > 0 THEN sl.amount ELSE 0 END) as total_gains,
          SUM(CASE WHEN sl.amount < 0 THEN ABS(sl.amount) ELSE 0 END) as total_losses,
          MAX(sl.amount) as max_transaction
        FROM soul_contracts sc
        LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        GROUP BY sc.id, sc.soul_type, sc.contract_status
      )
      SELECT 
        id,
        soul_type,
        contract_status,
        transaction_count,
        total_gains,
        total_losses,
        max_transaction,
        CASE 
          WHEN max_transaction > 500 THEN 'High Value'
          WHEN transaction_count > 20 THEN 'High Frequency'
          WHEN total_gains > total_losses * 3 THEN 'Suspicious Gains'
          ELSE 'Normal'
        END as risk_category
      FROM soul_stats
      WHERE transaction_count > 10 
        AND (max_transaction > 300 OR total_gains > total_losses * 2)
      ORDER BY max_transaction DESC
      LIMIT 10
    `);

    const duration = Date.now() - start;
    
    console.log(`✅ Identified ${result.rows.length} suspicious souls in ${duration}ms`);
    console.log('🎯 Perfect for: Fraud detection, compliance reporting, complex business rules');
    console.log('💡 Why DSQL wins: CTEs, window functions, complex logic in single query\n');
  }

  async demoBusinessIntelligence() {
    console.log('⚡ DSQL STRENGTH: Business Intelligence');
    console.log('Scenario: Monthly board report needs trending analysis\n');

    const start = Date.now();
    
    const result = await this.dsqlClient.query(`
      SELECT 
        DATE_TRUNC('month', sce.event_time) as month,
        COUNT(DISTINCT sc.id) as active_souls,
        COUNT(CASE WHEN sce.description LIKE '%Redeemed%' THEN 1 END) as redemptions,
        COUNT(CASE WHEN sce.description LIKE '%Condemned%' THEN 1 END) as condemnations,
        ROUND(
          COUNT(CASE WHEN sce.description LIKE '%Redeemed%' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN sce.description LIKE '%Condemned%' THEN 1 END), 0), 
          2
        ) as redemption_ratio,
        LAG(COUNT(DISTINCT sc.id)) OVER (ORDER BY DATE_TRUNC('month', sce.event_time)) as prev_month_souls,
        ROUND(
          (COUNT(DISTINCT sc.id) - LAG(COUNT(DISTINCT sc.id)) OVER (ORDER BY DATE_TRUNC('month', sce.event_time))) * 100.0 /
          NULLIF(LAG(COUNT(DISTINCT sc.id)) OVER (ORDER BY DATE_TRUNC('month', sce.event_time)), 0),
          2
        ) as growth_rate
      FROM soul_contract_events sce
      JOIN soul_contracts sc ON sce.soul_contract_id = sc.id
      WHERE sce.event_time >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', sce.event_time)
      ORDER BY month DESC
    `);

    const duration = Date.now() - start;
    
    console.log(`✅ Generated 6-month trend analysis in ${duration}ms`);
    console.log(`📊 Months analyzed: ${result.rows.length}`);
    console.log('🎯 Perfect for: Board reports, trend analysis, strategic planning');
    console.log('💡 Why DSQL wins: Window functions, time series analysis, complex calculations\n');
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
  console.log('🎭 Starting Database Contrast Demonstration\n');
  
  const demo = new ContrastDemo();
  await demo.runDemo();
  
  console.log('🎯 NARRATIVE SUMMARY');
  console.log('=' .repeat(50));
  console.log('🔥 DynamoDB excels at: User-facing apps, known patterns, predictable performance');
  console.log('⚡ DSQL excels at: Analytics, complex queries, business intelligence');
  console.log('💡 Choose based on your primary use case, not just raw performance numbers');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ContrastDemo;
