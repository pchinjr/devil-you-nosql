#!/usr/bin/env node

const { DynamoDBClient, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

// Small dataset: 10 souls, 10 events per soul, 50 ledger entries
const SOULS_COUNT = 10;
const EVENTS_PER_SOUL = 10;
const LEDGER_ENTRIES = 50;

class SmallDataSeeder {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
  }

  generateSoulData() {
    const souls = [];
    const statuses = ['Bound', 'Pending_Judgment', 'Redeemed', 'Condemned'];
    const soulTypes = ['Innocent', 'Sinner', 'Corrupt', 'Evil', 'Murderer', 'Betrayer'];
    const locations = ['Highway_66', 'Desert_Crossroads', 'Abandoned_Church', 'City_Alley', 'Graveyard', 'Hell_Gate'];
    
    for (let i = 1; i <= SOULS_COUNT; i++) {
      const soulType = soulTypes[Math.floor(Math.random() * soulTypes.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];
      const soulId = `${soulType.toLowerCase()}_${location.toLowerCase()}_${i.toString().padStart(3, '0')}`;
      
      souls.push({
        soulId,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        soulType,
        contractLocation: location,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      });
    }
    
    return souls;
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
            soul_type: { S: soul.soulType },
            contract_location: { S: soul.contractLocation },
            createdAt: { S: soul.createdAt.toISOString() }
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
              eventType: { S: j === 1 ? 'Contract_Created' : 'Status_Change' },
              timestamp: { S: eventTime.toISOString() }
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
            description: { S: `Soul power transaction: ${amount}` }
          }
        }
      });
    }
    
    // Write in batches of 25
    const chunks = [];
    for (let i = 0; i < batches.length; i += 25) {
      chunks.push(batches.slice(i, i + 25));
    }
    
    for (const chunk of chunks) {
      await this.dynamoClient.send(new BatchWriteItemCommand({
        RequestItems: {
          [TABLE_NAME]: chunk
        }
      }));
    }
    
    console.log(`✅ DynamoDB seeded with ${batches.length} items`);
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
        await client.query(
          `INSERT INTO soul_contracts (id, contract_status, soul_type, contract_location, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             contract_status = EXCLUDED.contract_status,
             soul_type = EXCLUDED.soul_type,
             contract_location = EXCLUDED.contract_location,
             updated_at = EXCLUDED.updated_at`,
          [soul.soulId, soul.status, soul.soulType, soul.contractLocation, soul.createdAt]
        );
        
        // Insert events
        for (let j = 1; j <= EVENTS_PER_SOUL; j++) {
          const eventTime = new Date(soul.createdAt.getTime() + j * 60000);
          await client.query(
            `INSERT INTO soul_contract_events (soul_contract_id, event_time, description)
             VALUES ($1, $2, $3)`,
            [soul.soulId, eventTime, j === 1 ? 'Contract Created' : 'Status Change']
          );
        }
      }
      
      // Insert ledger entries
      for (let i = 1; i <= LEDGER_ENTRIES; i++) {
        const soul = souls[Math.floor(Math.random() * souls.length)];
        const amount = Math.floor(Math.random() * 1000) + 1;
        const timestamp = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
        
        await client.query(
          `INSERT INTO soul_ledger (soul_contract_id, amount, transaction_time, description)
           VALUES ($1, $2, $3, $4)`,
          [soul.soulId, amount, timestamp, `Soul power transaction: ${amount}`]
        );
      }
      
      await client.query('COMMIT');
      console.log(`✅ Aurora DSQL seeded with ${SOULS_COUNT} souls`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  async run() {
    console.log('🌱 Starting small dataset seeding...');
    console.log(`  Souls: ${SOULS_COUNT}`);
    console.log(`  Events per soul: ${EVENTS_PER_SOUL}`);
    console.log(`  Ledger entries: ${LEDGER_ENTRIES}\n`);
    
    const startTime = Date.now();
    
    try {
      await this.seedDynamoDB();
      await this.seedDSQL();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Small dataset seeding completed in ${duration}s`);
      
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  new SmallDataSeeder().run();
}

module.exports = SmallDataSeeder;
