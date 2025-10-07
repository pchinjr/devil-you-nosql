#!/usr/bin/env node

const { DynamoDBClient, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { DSQLSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

// Configurable dataset sizes
const SOULS_COUNT = parseInt(process.env.SOULS_COUNT) || 1000;
const EVENTS_PER_SOUL = parseInt(process.env.EVENTS_PER_SOUL) || 50;
const LEDGER_ENTRIES = parseInt(process.env.LEDGER_ENTRIES) || 5000;

class LargeDataSeeder {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
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

  generateSoulData() {
    const souls = [];
    const statuses = ['Active', 'Pending', 'Released', 'Condemned'];
    
    for (let i = 1; i <= SOULS_COUNT; i++) {
      const soulId = `soul-${i.toString().padStart(6, '0')}`;
      souls.push({
        soulId,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
      });
    }
    
    return souls;
  }

  async seedDynamoDB() {
    console.log(`Seeding DynamoDB with ${SOULS_COUNT} souls...`);
    
    const souls = this.generateSoulData();
    const batches = [];
    
    // Prepare soul contracts
    for (const soul of souls) {
      batches.push({
        PutRequest: {
          Item: {
            PK: { S: `SOUL#${soul.soulId}` },
            SK: { S: 'CONTRACT' },
            soulId: { S: soul.soulId },
            status: { S: soul.status },
            createdAt: { S: soul.createdAt.toISOString() },
            GSI1PK: { S: `STATUS#${soul.status}` },
            GSI1SK: { S: soul.createdAt.toISOString() }
          }
        }
      });
      
      // Add events for each soul
      for (let j = 1; j <= EVENTS_PER_SOUL; j++) {
        const eventTime = new Date(soul.createdAt.getTime() + j * 60000);
        batches.push({
          PutRequest: {
            Item: {
              PK: { S: `SOUL#${soul.soulId}` },
              SK: { S: `EVENT#${eventTime.toISOString()}` },
              eventType: { S: j === 1 ? 'Created' : 'StatusChange' },
              timestamp: { S: eventTime.toISOString() },
              GSI1PK: { S: `EVENT#${eventTime.toISOString().split('T')[0]}` },
              GSI1SK: { S: eventTime.toISOString() }
            }
          }
        });
      }
    }
    
    // Add ledger entries
    for (let i = 1; i <= LEDGER_ENTRIES; i++) {
      const soul = souls[Math.floor(Math.random() * souls.length)];
      const amount = Math.floor(Math.random() * 1000) + 1;
      const timestamp = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
      
      batches.push({
        PutRequest: {
          Item: {
            PK: { S: `SOUL#${soul.soulId}` },
            SK: { S: `LEDGER#${timestamp.toISOString()}` },
            amount: { N: amount.toString() },
            timestamp: { S: timestamp.toISOString() },
            GSI1PK: { S: `LEDGER#${timestamp.toISOString().split('T')[0]}` },
            GSI1SK: { S: timestamp.toISOString() }
          }
        }
      });
    }
    
    // Write in batches of 25 (DynamoDB limit)
    const batchSize = 25;
    for (let i = 0; i < batches.length; i += batchSize) {
      const batch = batches.slice(i, i + batchSize);
      await this.dynamoClient.send(new BatchWriteItemCommand({
        RequestItems: { [TABLE_NAME]: batch }
      }));
      
      if (i % 250 === 0) {
        console.log(`  Processed ${i + batch.length}/${batches.length} items`);
      }
    }
    
    console.log(`✓ DynamoDB seeded with ${batches.length} total items`);
  }

  async seedDSQL() {
    console.log(`Seeding Aurora DSQL with ${SOULS_COUNT} souls...`);
    
    const client = await this.connectDSQL();
    await client.connect();
    
    const souls = this.generateSoulData();
    
    try {
      await client.query('BEGIN');
      
      // Insert soul contracts
      for (const soul of souls) {
        await client.query(`
          INSERT INTO soul_contracts (soul_id, status, created_at)
          VALUES ($1, $2, $3)
        `, [soul.soulId, soul.status, soul.createdAt]);
      }
      
      // Get contract IDs for events and ledger
      const contracts = await client.query('SELECT id, soul_id, created_at FROM soul_contracts');
      const contractMap = new Map(contracts.rows.map(c => [c.soul_id, c]));
      
      // Insert events
      let eventCount = 0;
      for (const soul of souls) {
        const contract = contractMap.get(soul.soulId);
        for (let j = 1; j <= EVENTS_PER_SOUL; j++) {
          const eventTime = new Date(contract.created_at.getTime() + j * 60000);
          await client.query(`
            INSERT INTO soul_contract_events (soul_contract_id, event_type, created_at)
            VALUES ($1, $2, $3)
          `, [contract.id, j === 1 ? 'Created' : 'StatusChange', eventTime]);
          eventCount++;
        }
        
        if (eventCount % 1000 === 0) {
          console.log(`  Inserted ${eventCount} events`);
        }
      }
      
      // Insert ledger entries
      for (let i = 1; i <= LEDGER_ENTRIES; i++) {
        const soul = souls[Math.floor(Math.random() * souls.length)];
        const contract = contractMap.get(soul.soulId);
        const amount = Math.floor(Math.random() * 1000) + 1;
        const timestamp = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
        
        await client.query(`
          INSERT INTO soul_ledger (soul_contract_id, amount, created_at)
          VALUES ($1, $2, $3)
        `, [contract.id, amount, timestamp]);
        
        if (i % 500 === 0) {
          console.log(`  Inserted ${i} ledger entries`);
        }
      }
      
      await client.query('COMMIT');
      console.log(`✓ DSQL seeded with ${SOULS_COUNT} contracts, ${eventCount} events, ${LEDGER_ENTRIES} ledger entries`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  async run() {
    console.log('=== LARGE DATASET SEEDING ===\n');
    console.log(`Configuration:`);
    console.log(`  Souls: ${SOULS_COUNT}`);
    console.log(`  Events per soul: ${EVENTS_PER_SOUL}`);
    console.log(`  Ledger entries: ${LEDGER_ENTRIES}\n`);
    
    const startTime = Date.now();
    
    try {
      await this.seedDynamoDB();
      await this.seedDSQL();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Large dataset seeding completed in ${duration}s`);
      
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new LargeDataSeeder().run();
}

module.exports = LargeDataSeeder;
