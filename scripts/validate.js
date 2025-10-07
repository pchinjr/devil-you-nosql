#!/usr/bin/env node

const { DynamoDBClient, QueryCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DSQLSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class DataValidator {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    this.errors = [];
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

  async validateDataConsistency() {
    console.log('Validating data consistency between DynamoDB and DSQL...\n');
    
    // Get DynamoDB soul contracts
    const dynamoContracts = await this.getDynamoContracts();
    
    // Get DSQL soul contracts
    const dsqlContracts = await this.getDSQLContracts();
    
    // Compare counts
    if (dynamoContracts.length !== dsqlContracts.length) {
      this.errors.push(`Contract count mismatch: DynamoDB=${dynamoContracts.length}, DSQL=${dsqlContracts.length}`);
    }
    
    // Validate individual contracts
    for (const dynamo of dynamoContracts) {
      const dsql = dsqlContracts.find(d => d.soul_id === dynamo.soul_id);
      if (!dsql) {
        this.errors.push(`Soul ${dynamo.soul_id} exists in DynamoDB but not DSQL`);
        continue;
      }
      
      if (dynamo.status !== dsql.status) {
        this.errors.push(`Status mismatch for ${dynamo.soul_id}: DynamoDB=${dynamo.status}, DSQL=${dsql.status}`);
      }
    }
    
    console.log(`✓ Validated ${dynamoContracts.length} soul contracts`);
  }

  async getDynamoContracts() {
    const result = await this.dynamoClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': { S: 'CONTRACT' } }
    }));
    
    return result.Items.map(item => ({
      soul_id: item.PK.S.replace('SOUL#', ''),
      status: item.status?.S || 'Unknown'
    }));
  }

  async getDSQLContracts() {
    const client = await this.connectDSQL();
    await client.connect();
    
    const result = await client.query('SELECT soul_id, status FROM soul_contracts ORDER BY soul_id');
    await client.end();
    
    return result.rows;
  }

  async validateIndexes() {
    console.log('Validating DSQL indexes...\n');
    
    const client = await this.connectDSQL();
    await client.connect();
    
    const indexes = await client.query(`
      SELECT schemaname, tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    const expectedIndexes = [
      'soul_contracts_soul_id_idx',
      'soul_contract_events_soul_contract_id_idx',
      'soul_ledger_soul_contract_id_idx'
    ];
    
    const actualIndexes = indexes.rows.map(r => r.indexname).filter(name => !name.endsWith('_pkey'));
    
    for (const expected of expectedIndexes) {
      if (!actualIndexes.includes(expected)) {
        this.errors.push(`Missing index: ${expected}`);
      }
    }
    
    console.log(`✓ Validated ${actualIndexes.length} indexes`);
    await client.end();
  }

  async validatePerformance() {
    console.log('Validating performance characteristics...\n');
    
    const start = Date.now();
    
    // Test DynamoDB point lookup
    const dynamoStart = Date.now();
    await this.dynamoClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: 'SOUL#soul-001' } }
    }));
    const dynamoTime = Date.now() - dynamoStart;
    
    // Test DSQL point lookup
    const client = await this.connectDSQL();
    await client.connect();
    
    const dsqlStart = Date.now();
    await client.query('SELECT * FROM soul_contracts WHERE soul_id = $1', ['soul-001']);
    const dsqlTime = Date.now() - dsqlStart;
    
    await client.end();
    
    console.log(`DynamoDB lookup: ${dynamoTime}ms`);
    console.log(`DSQL lookup: ${dsqlTime}ms`);
    
    if (dynamoTime > 100) {
      this.errors.push(`DynamoDB lookup too slow: ${dynamoTime}ms`);
    }
    
    if (dsqlTime > 500) {
      this.errors.push(`DSQL lookup too slow: ${dsqlTime}ms`);
    }
    
    console.log('✓ Performance validation complete');
  }

  async run() {
    console.log('=== DATA VALIDATION SUITE ===\n');
    
    try {
      await this.validateDataConsistency();
      await this.validateIndexes();
      await this.validatePerformance();
      
      if (this.errors.length === 0) {
        console.log('\n✅ All validations passed!');
      } else {
        console.log('\n❌ Validation errors:');
        this.errors.forEach(error => console.log(`  - ${error}`));
        process.exit(1);
      }
    } catch (error) {
      console.error('Validation failed:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new DataValidator().run();
}

module.exports = DataValidator;
