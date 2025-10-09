#!/usr/bin/env node

require('dotenv').config();
const { DynamoDBClient, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

const DEFAULT_SOULS = 1000;
const DEFAULT_EVENTS_PER_SOUL = 50;
const DEFAULT_LEDGER_ENTRIES = 5000;

class SeedData {
  constructor(options = {}) {
    this.config = {
      soulCount: coercePositiveInt(options.soulCount) ?? coercePositiveInt(process.env.SOULS_COUNT) ?? DEFAULT_SOULS,
      eventsPerSoul: coerceNonNegativeInt(options.eventsPerSoul) ?? coerceNonNegativeInt(process.env.EVENTS_PER_SOUL) ?? DEFAULT_EVENTS_PER_SOUL,
      ledgerEntries: coerceNonNegativeInt(options.ledgerEntries) ?? coerceNonNegativeInt(process.env.LEDGER_ENTRIES) ?? DEFAULT_LEDGER_ENTRIES
    };

    if (!this.config.soulCount || this.config.soulCount <= 0) {
      throw new Error('soulCount must be a positive integer');
    }

    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
  }

  prepareDataset() {
    const souls = [];
    const statuses = ['Bound', 'Pending_Judgment', 'Redeemed', 'Condemned'];
    const soulTypes = ['Innocent', 'Sinner', 'Corrupt', 'Evil', 'Murderer', 'Betrayer'];
    const locations = ['Highway_66', 'Desert_Crossroads', 'Abandoned_Church', 'City_Alley', 'Graveyard', 'Hell_Gate'];
    const padSize = Math.max(3, String(this.config.soulCount).length);

    for (let i = 1; i <= this.config.soulCount; i++) {
      const soulType = soulTypes[Math.floor(Math.random() * soulTypes.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];
      const soulId = `${soulType.toLowerCase()}_${location.toLowerCase()}_${String(i).padStart(padSize, '0')}`;
      const createdAt = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);

      const soul = {
        soulId,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        soulType,
        contractLocation: location,
        createdAt,
        events: [],
        ledgerEntries: []
      };

      for (let j = 1; j <= this.config.eventsPerSoul; j++) {
        const eventTime = new Date(createdAt.getTime() + j * 60000);
        soul.events.push({
          eventTime,
          description: j === 1 ? 'Contract Created' : 'Status Change',
          eventType: j === 1 ? 'Contract_Created' : 'Status_Change'
        });
      }

      souls.push(soul);
    }

    const ledgerEntries = [];
    for (let i = 0; i < this.config.ledgerEntries; i++) {
      const soul = souls[Math.floor(Math.random() * souls.length)];
      const amount = Math.floor(Math.random() * 1000) + 1;
      const timestamp = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
      const entry = {
        soulId: soul.soulId,
        amount,
        timestamp,
        description: `Soul power transaction: ${amount}`
      };
      ledgerEntries.push(entry);
      soul.ledgerEntries.push(entry);
    }

    return { souls, ledgerEntries };
  }

  async seedDynamoDB(dataset) {
    const { souls, ledgerEntries } = dataset;
    const totalEvents = souls.reduce((acc, soul) => acc + soul.events.length, 0);
    console.log(`Seeding DynamoDB with ${souls.length} souls, ${totalEvents} events, ${ledgerEntries.length} ledger entries...`);

    const requests = [];

    for (const soul of souls) {
      requests.push({
        PutRequest: {
          Item: {
            PK: { S: `SOUL#${soul.soulId}` },
            SK: { S: 'CONTRACT' },
            soulId: { S: soul.soulId },
            status: { S: soul.status },
            soul_type: { S: soul.soulType },
            contract_location: { S: soul.contractLocation },
            createdAt: { S: soul.createdAt.toISOString() },
            GSI1PK: { S: `STATUS#${soul.status}` },
            GSI1SK: { S: soul.createdAt.toISOString() }
          }
        }
      });

      for (const event of soul.events) {
        requests.push({
          PutRequest: {
            Item: {
              PK: { S: `SOUL#${soul.soulId}` },
              SK: { S: `EVENT#${event.eventTime.toISOString()}` },
              eventType: { S: event.eventType },
              timestamp: { S: event.eventTime.toISOString() },
              description: { S: event.description },
              GSI1PK: { S: `EVENT#${event.eventTime.toISOString().split('T')[0]}` },
              GSI1SK: { S: event.eventTime.toISOString() }
            }
          }
        });
      }
    }

    for (const entry of ledgerEntries) {
      requests.push({
        PutRequest: {
          Item: {
            PK: { S: `SOUL#${entry.soulId}` },
            SK: { S: `LEDGER#${entry.timestamp.toISOString()}` },
            amount: { N: entry.amount.toString() },
            timestamp: { S: entry.timestamp.toISOString() },
            description: { S: entry.description },
            GSI1PK: { S: `LEDGER#${entry.timestamp.toISOString().split('T')[0]}` },
            GSI1SK: { S: entry.timestamp.toISOString() }
          }
        }
      });
    }

    const batchSize = 25;
    for (let i = 0; i < requests.length; i += batchSize) {
      let chunk = requests.slice(i, i + batchSize);
      let attempt = 0;

      while (chunk.length > 0) {
        const response = await this.dynamoClient.send(new BatchWriteItemCommand({
          RequestItems: { [TABLE_NAME]: chunk }
        }));

        const unprocessed = response.UnprocessedItems?.[TABLE_NAME] || [];
        if (!unprocessed.length) {
          break;
        }

        attempt += 1;
        const delay = Math.min(1000, 50 * attempt);
        await wait(delay);
        chunk = unprocessed;
      }

      if ((i / batchSize) % 20 === 0) {
        console.log(`  Processed ${Math.min(i + batchSize, requests.length)}/${requests.length} DynamoDB items`);
      }
    }

    console.log(`✓ DynamoDB seeding complete (${requests.length} items written)`);
  }

  async seedDSQL(dataset) {
    if (!DSQL_ENDPOINT) {
      console.log('⚠ Skipping Aurora DSQL seeding: DSQL_ENDPOINT not set');
      return;
    }

    const { souls, ledgerEntries } = dataset;
    const client = await this.connectDSQL();
    await client.connect();

    try {
      await client.query('BEGIN');

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

        for (const event of soul.events) {
          await client.query(
            `INSERT INTO soul_contract_events (soul_contract_id, event_time, description)
             VALUES ($1, $2, $3)`,
            [soul.soulId, event.eventTime, event.description]
          );
        }
      }

      for (const entry of ledgerEntries) {
        await client.query(
          `INSERT INTO soul_ledger (soul_contract_id, amount, transaction_time, description)
           VALUES ($1, $2, $3, $4)`,
          [entry.soulId, entry.amount, entry.timestamp, entry.description]
        );
      }

      await client.query('COMMIT');
      console.log(`✓ Aurora DSQL seeding complete (${souls.length} souls, ${ledgerEntries.length} ledger entries)`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  async connectDSQL() {
    if (!DSQL_ENDPOINT) {
      throw new Error('DSQL_ENDPOINT is not defined in the environment');
    }

    const signer = new DsqlSigner({ hostname: DSQL_ENDPOINT, region: AWS_REGION });
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

  async run() {
    const { soulCount, eventsPerSoul, ledgerEntries } = this.config;

    console.log('=== DATASET SEEDING ===');
    console.log(`  Souls: ${soulCount}`);
    console.log(`  Events per soul: ${eventsPerSoul}`);
    console.log(`  Ledger entries: ${ledgerEntries}\n`);

    const start = Date.now();

    try {
      const dataset = this.prepareDataset();
      await this.seedDynamoDB(dataset);
      await this.seedDSQL(dataset);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`\n✅ Dataset seeding completed in ${duration}s`);
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    }
  }
}

function coercePositiveInt(value) {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function coerceNonNegativeInt(value) {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseCliArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  const args = parseCliArgs(process.argv.slice(2));
  const seeder = new SeedData({
    soulCount: args.souls ?? args.soulCount,
    eventsPerSoul: args.events ?? args.eventsPerSoul,
    ledgerEntries: args.ledger ?? args.ledgerEntries
  });

  seeder.run();
}

module.exports = SeedData;
