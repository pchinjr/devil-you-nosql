#!/usr/bin/env node

const { DynamoDBClient, DescribeTableCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class DatabaseVerifier {
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

  async verifyDynamoDB() {
    console.log('🔍 Verifying DynamoDB...');
    
    try {
      // Check if table exists
      const tableInfo = await this.dynamoClient.send(new DescribeTableCommand({
        TableName: TABLE_NAME
      }));
      
      console.log(`  ✅ Table '${TABLE_NAME}' exists`);
      console.log(`  📊 Status: ${tableInfo.Table.TableStatus}`);
      
      // Count items
      const scanResult = await this.dynamoClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        Select: 'COUNT'
      }));
      
      console.log(`  📈 Total items: ${scanResult.Count}`);
      
      // Sample a few items to verify structure
      const sampleResult = await this.dynamoClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 3
      }));
      
      if (sampleResult.Items && sampleResult.Items.length > 0) {
        console.log('  🎯 Sample data structure verified');
        const sampleItem = sampleResult.Items[0];
        if (sampleItem.PK && sampleItem.SK) {
          console.log(`    Example: PK=${sampleItem.PK.S}, SK=${sampleItem.SK.S}`);
        }
      }
      
      return true;
    } catch (error) {
      console.log(`  ❌ DynamoDB verification failed: ${error.message}`);
      return false;
    }
  }

  async verifyDSQL() {
    console.log('🔍 Verifying Aurora DSQL...');
    
    let client;
    try {
      client = await this.connectDSQL();
      await client.connect();
      
      console.log(`  ✅ Connected to DSQL endpoint: ${DSQL_ENDPOINT}`);
      
      // Check if tables exist
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('soul_contracts', 'soul_contract_events', 'soul_ledger')
        ORDER BY table_name
      `);
      
      const expectedTables = ['soul_contracts', 'soul_contract_events', 'soul_ledger'];
      const existingTables = tablesResult.rows.map(row => row.table_name);
      
      for (const table of expectedTables) {
        if (existingTables.includes(table)) {
          console.log(`  ✅ Table '${table}' exists`);
          
          // Count rows
          const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
          console.log(`    📈 Rows: ${countResult.rows[0].count}`);
        } else {
          console.log(`  ❌ Table '${table}' missing`);
        }
      }
      
      // Verify sample data structure
      if (existingTables.includes('soul_contracts')) {
        const sampleResult = await client.query(`
          SELECT id, contract_status, soul_type, contract_location 
          FROM soul_contracts 
          LIMIT 3
        `);
        
        if (sampleResult.rows.length > 0) {
          console.log('  🎯 Sample data structure verified');
          const sample = sampleResult.rows[0];
          console.log(`    Example: ${sample.id} (${sample.soul_type} at ${sample.contract_location})`);
        }
      }
      
      return existingTables.length === expectedTables.length;
    } catch (error) {
      console.log(`  ❌ DSQL verification failed: ${error.message}`);
      return false;
    } finally {
      if (client) {
        await client.end();
      }
    }
  }

  async run() {
    console.log('🔧 Verifying database connectivity and structure...\n');
    
    const dynamoOk = await this.verifyDynamoDB();
    console.log();
    const dsqlOk = await this.verifyDSQL();
    
    console.log('\n📋 Verification Summary:');
    console.log(`  DynamoDB: ${dynamoOk ? '✅ Ready' : '❌ Issues found'}`);
    console.log(`  Aurora DSQL: ${dsqlOk ? '✅ Ready' : '❌ Issues found'}`);
    
    if (dynamoOk && dsqlOk) {
      console.log('\n🎉 All databases verified and ready for Ghost Rider soul tracking!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some databases need attention before proceeding.');
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new DatabaseVerifier().run();
}

module.exports = DatabaseVerifier;
