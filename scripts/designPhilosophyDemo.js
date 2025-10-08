#!/usr/bin/env node

const { DynamoDBClient, QueryCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class DesignPhilosophyDemo {
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

  async demonstrateAccessPatterns() {
    console.log('🎭 DESIGN PHILOSOPHY DEMONSTRATION');
    console.log('The Devil You Know vs The Devil You Don\'t\n');

    // Scenario 1: DynamoDB's strength - known access pattern
    console.log('📋 SCENARIO 1: Get complete soul profile (DynamoDB\'s sweet spot)');
    console.log('Access Pattern: "Show me everything about soul X - contract, events, ledger"\n');

    await this.showDynamoStrength();
    console.log('');
    await this.showDSQLEquivalent();
    console.log('');

    // Scenario 2: DSQL's strength - ad-hoc queries
    console.log('📋 SCENARIO 2: Find condemned souls at graveyards (flexible query)\n');

    await this.showDynamoApproach();
    console.log('');
    await this.showDSQLApproach();
    console.log('');
    
    // Scenario 3: Ad-hoc analytics
    console.log('📊 SCENARIO 3: Ad-hoc analytics - "Show me soul power trends by location and type"\n');
    
    await this.showDynamoLimitations();
    console.log('');
    await this.showDSQLFlexibility();
  }

  async showDynamoStrength() {
    console.log('🔥 DYNAMODB STRENGTH: Single-Table Design Shines');
    console.log('Strategy: Get all related data in one query\n');

    console.log('Single-Table Design:');
    console.log('  PK = "SOUL#evil_highway_66_0160"');
    console.log('  SK = "CONTRACT" → soul contract details');
    console.log('  SK = "EVENT#timestamp" → all soul events');
    console.log('  SK = "LEDGER#timestamp" → all transactions\n');

    console.log('Query: Get complete soul profile');
    console.log('  → Single Query operation on PK');
    console.log('  → All related data in one partition');
    console.log('  → Perfect data locality, minimal latency\n');

    const startTime = Date.now();
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: 'SOUL#evil_highway_66_0160' }
        },
        Limit: 10
      }));
      
      const queryTime = Date.now() - startTime;
      console.log(`✅ Retrieved complete profile in ${queryTime}ms (${result.Items?.length || 0} items)`);
      
      if (result.Items?.length > 0) {
        const contract = result.Items.find(item => item.SK.S === 'CONTRACT');
        const events = result.Items.filter(item => item.SK.S.startsWith('EVENT#'));
        const ledger = result.Items.filter(item => item.SK.S.startsWith('LEDGER#'));
        
        console.log(`   📄 Contract: ${contract?.status?.S || 'Unknown'} status`);
        console.log(`   📅 Events: ${events.length} timeline entries`);
        console.log(`   💰 Ledger: ${ledger.length} transactions`);
      }
    } catch (error) {
      console.log(`❌ Query failed: ${error.message}`);
    }

    console.log('\n🎯 DynamoDB Single-Table Wins:');
    console.log('  ✅ One query gets everything - perfect data locality');
    console.log('  ✅ Predictable sub-10ms performance at any scale');
    console.log('  ✅ No joins needed - all related data co-located');
    console.log('  ✅ Atomic updates across all soul data');
    console.log('  🏆 This is where DynamoDB absolutely dominates!');
  }

  async showDSQLEquivalent() {
    console.log('⚡ AURORA DSQL: Multiple Table Approach');
    console.log('Strategy: Join normalized tables\n');

    console.log('Normalized Schema:');
    console.log('  soul_contracts → soul_contract_events (1:many)');
    console.log('  soul_contracts → soul_ledger (1:many)');
    console.log('  Requires JOINs to get complete picture\n');

    const client = await this.connectDSQL();
    await client.connect();

    const startTime = Date.now();
    try {
      const result = await client.query(`
        SELECT 
          sc.id,
          sc.contract_status,
          sc.soul_type,
          COUNT(DISTINCT sce.id) as event_count,
          COUNT(DISTINCT sl.id) as ledger_count,
          SUM(sl.amount) as total_power
        FROM soul_contracts sc
        LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id
        LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        WHERE sc.id LIKE '%highway%'
        GROUP BY sc.id, sc.contract_status, sc.soul_type
        LIMIT 1
      `);
      
      const queryTime = Date.now() - startTime;
      console.log(`✅ Retrieved profile via JOINs in ${queryTime}ms`);
      
      if (result.rows.length > 0) {
        const profile = result.rows[0];
        console.log(`   📄 Contract: ${profile.contract_status} status`);
        console.log(`   📅 Events: ${profile.event_count} timeline entries`);
        console.log(`   💰 Ledger: ${profile.ledger_count} transactions (${profile.total_power} total power)`);
      }
    } catch (error) {
      console.log(`❌ Query failed: ${error.message}`);
    } finally {
      await client.end();
    }

    console.log('\n🔧 DSQL Trade-offs:');
    console.log('  ✅ Normalized data - no duplication');
    console.log('  ✅ Rich aggregations in single query');
    console.log('  ⚠️  Multiple table JOINs add complexity');
    console.log('  ⚠️  Performance varies with JOIN complexity');
    console.log('  📊 Better for analytics, but more overhead for simple lookups');
  }

  async showDynamoApproach() {
    console.log('🔥 DYNAMODB APPROACH: Design-Time Composition');
    console.log('Strategy: Pre-compose access patterns into key structure\n');

    // Show the key design
    console.log('Key Design:');
    console.log('  PK = "SOUL#evil_highway_66_0160"');
    console.log('  SK = "CONTRACT" | "EVENT#timestamp" | "LEDGER#timestamp"');
    console.log('  status = "Pending_Judgment" | "Condemned" | "Redeemed"\n');

    console.log('Query: Find souls with specific status');
    console.log('  → Scan with filter (no GSI configured)');
    console.log('  → Shows what happens without proper access pattern design\n');

    // Simple scan to find contract items with a specific status
    const startTime = Date.now();
    try {
      const result = await this.dynamoClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :contract AND #status = :statusValue',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':contract': { S: 'CONTRACT' },
          ':statusValue': { S: 'Pending_Judgment' }
        },
        Limit: 3
      }));
      
      const queryTime = Date.now() - startTime;
      console.log(`✅ Found ${result.Items?.length || 0} souls in ${queryTime}ms (via table scan)`);
      
      if (result.Items?.length > 0) {
        const sample = result.Items[0];
        console.log(`   Example: ${sample.PK.S} → Status: ${sample.status?.S}`);
      }
    } catch (error) {
      console.log(`❌ Scan failed: ${error.message}`);
    }

    console.log('\n🔧 DynamoDB Design Reality:');
    console.log('  ⚠️  Table scan required - not optimal for production');
    console.log('  ✅ With proper GSI: O(1) status lookups would be fast');
    console.log('  ✅ Single-table design keeps related data together');
    console.log('  ❌ New query patterns need infrastructure changes (GSIs)');
    console.log('  🎯 Philosophy: Design for known access patterns upfront');
  }

  async showDSQLApproach() {
    console.log('⚡ AURORA DSQL APPROACH: Runtime Computation');
    console.log('Strategy: Declare relationships, compute at query time\n');

    console.log('Schema Design:');
    console.log('  soul_contracts(id, contract_status, soul_type, contract_location)');
    console.log('  soul_contract_events(soul_contract_id, event_time, description)');
    console.log('  soul_ledger(soul_contract_id, amount, transaction_time)\n');

    console.log('Query: Find condemned souls at graveyards');
    console.log('  → Declarative WHERE clause');
    console.log('  → Query optimizer handles execution');
    console.log('  → Flexible but requires computation\n');

    const client = await this.connectDSQL();
    await client.connect();

    const startTime = Date.now();
    try {
      const result = await client.query(`
        SELECT id, soul_type, contract_location, contract_status
        FROM soul_contracts 
        WHERE contract_status = 'Condemned' 
          AND contract_location = 'Graveyard'
        LIMIT 5
      `);
      
      const queryTime = Date.now() - startTime;
      console.log(`✅ Found ${result.rows.length} souls in ${queryTime}ms`);
      
      if (result.rows.length > 0) {
        const sample = result.rows[0];
        console.log(`   Example: ${sample.id} (${sample.soul_type} at ${sample.contract_location})`);
      }
    } catch (error) {
      console.log(`❌ Query failed: ${error.message}`);
    } finally {
      await client.end();
    }
  }

  async showDynamoLimitations() {
    console.log('🔥 DYNAMODB: When Flexibility Hits the Wall');
    console.log('New requirement: "Show soul power trends by location AND type"\n');

    console.log('The Problem:');
    console.log('  ❌ No ad-hoc joins between items');
    console.log('  ❌ No aggregation across partitions');
    console.log('  ❌ Current table has no GSIs for this query pattern');
    console.log('  ❌ Would need to scan entire table or add new GSI\n');

    console.log('DynamoDB Solution Options:');
    console.log('  Option 1: Full table scan + client-side processing');
    console.log('  Option 2: Add GSI for location+type (requires table update)');
    console.log('  Option 3: Multiple queries + application aggregation');
    console.log('  Option 4: Pre-compute results in separate items\n');

    console.log('Reality: Without proper GSIs, you\'re stuck with expensive scans');
    console.log('This is why access patterns must be known at design time!');
  }

  async showDSQLFlexibility() {
    console.log('⚡ AURORA DSQL: Runtime Flexibility Shines');
    console.log('Same requirement: "Show soul power trends by location AND type"\n');

    const client = await this.connectDSQL();
    await client.connect();

    console.log('The Solution:');
    console.log('  ✅ Single declarative query');
    console.log('  ✅ JOIN contracts with ledger');
    console.log('  ✅ GROUP BY multiple dimensions');
    console.log('  ✅ Server-side aggregation\n');

    const startTime = Date.now();
    try {
      const result = await client.query(`
        SELECT 
          sc.contract_location,
          sc.soul_type,
          COUNT(*) as transaction_count,
          SUM(sl.amount) as total_power,
          AVG(sl.amount) as avg_power,
          RANK() OVER (ORDER BY SUM(sl.amount) DESC) as power_rank
        FROM soul_contracts sc
        JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
        GROUP BY sc.contract_location, sc.soul_type
        ORDER BY total_power DESC
        LIMIT 10
      `);
      
      const queryTime = Date.now() - startTime;
      console.log(`✅ Analytics completed in ${queryTime}ms\n`);
      
      console.log('📊 Soul Power Rankings:');
      console.log('Location'.padEnd(20) + 'Type'.padEnd(12) + 'Total Power'.padEnd(12) + 'Rank');
      console.log('-'.repeat(60));
      
      result.rows.forEach(row => {
        console.log(
          row.contract_location.padEnd(20) + 
          row.soul_type.padEnd(12) + 
          row.total_power.toString().padEnd(12) + 
          row.power_rank
        );
      });
      
    } catch (error) {
      console.log(`❌ Analytics failed: ${error.message}`);
    } finally {
      await client.end();
    }
  }

  async run() {
    try {
      await this.demonstrateAccessPatterns();
      
      console.log('\n🎭 THE PHILOSOPHICAL DIVIDE:');
      console.log('');
      console.log('DynamoDB (Design-Time Composition):');
      console.log('  • Pre-encode all access patterns into keys');
      console.log('  • Trade flexibility for predictable O(1) performance');
      console.log('  • Perfect for known, stable access patterns');
      console.log('  • "The devil you know" - predictable but rigid');
      console.log('');
      console.log('Aurora DSQL (Runtime Computation):');
      console.log('  • Declare relationships, compute on demand');
      console.log('  • Trade predictability for query flexibility');
      console.log('  • Perfect for analytical and ad-hoc queries');
      console.log('  • "The devil you don\'t" - flexible but variable');
      console.log('');
      console.log('Choose your devil wisely! 👹');
      
    } catch (error) {
      console.error('Demo failed:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new DesignPhilosophyDemo().run();
}

module.exports = DesignPhilosophyDemo;
