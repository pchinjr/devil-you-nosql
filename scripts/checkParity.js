#!/usr/bin/env node

require('dotenv').config();
const {
  DynamoDBClient,
  ScanCommand,
  QueryCommand
} = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class DataParityChecker {
  constructor(options = {}) {
    this.config = {
      sampleSize: coercePositiveInt(options.sampleSize) ?? coercePositiveInt(options.souls) ?? 25,
      soulIds: Array.isArray(options.soulsList) ? options.soulsList : [],
      includeEvents: options.skipEvents ? false : true,
      includeLedger: options.skipLedger ? false : true
    };

    if (!DSQL_ENDPOINT) {
      throw new Error('DSQL_ENDPOINT must be set to run the parity checker');
    }

    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    this.dsqlClientPromise = null;
    this.mismatches = [];
    this.checkedSouls = 0;
  }

  async connectDSQL() {
    if (!this.dsqlClientPromise) {
      const signer = new DsqlSigner({ hostname: DSQL_ENDPOINT, region: AWS_REGION });
      this.dsqlClientPromise = signer.getDbConnectAdminAuthToken()
        .then(token => {
          const client = new Client({
            host: DSQL_ENDPOINT,
            port: 5432,
            user: 'admin',
            password: token,
            database: 'postgres',
            ssl: { rejectUnauthorized: false }
          });
          return client.connect().then(() => client);
        });
    }
    return this.dsqlClientPromise;
  }

  async resolveSoulIds() {
    if (this.config.soulIds.length > 0) {
      return Array.from(new Set(this.config.soulIds));
    }

    const soulIds = [];
    let lastEvaluatedKey;

    while (soulIds.length < this.config.sampleSize) {
      const response = await this.dynamoClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'PK',
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: {
          ':sk': { S: 'CONTRACT' }
        },
        ExclusiveStartKey: lastEvaluatedKey
      }));

      const items = response.Items || [];
      for (const item of items) {
        if (!item.PK?.S?.startsWith('SOUL#')) {
          continue;
        }
        const soulId = item.PK.S.replace('SOUL#', '');
        soulIds.push(soulId);
        if (soulIds.length >= this.config.sampleSize) {
          break;
        }
      }

      if (!response.LastEvaluatedKey || soulIds.length >= this.config.sampleSize) {
        break;
      }
      lastEvaluatedKey = response.LastEvaluatedKey;
    }

    return soulIds;
  }

  async fetchDynamoSoul(soulId) {
    const response = await this.dynamoClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `SOUL#${soulId}` }
      },
      ScanIndexForward: true
    }));

    const contractItem = response.Items.find(item => item.SK?.S === 'CONTRACT');
    const events = [];
    const ledger = [];

    for (const item of response.Items) {
      const sortKey = item.SK?.S || '';
      if (sortKey === 'CONTRACT') {
        continue;
      }
      if (sortKey.startsWith('EVENT#')) {
        events.push(this.parseDynamoEventItem(item));
      } else if (sortKey.startsWith('LEDGER#')) {
        ledger.push(this.parseDynamoLedgerItem(item));
      }
    }

    return {
      soulId,
      contract: contractItem ? this.parseDynamoContractItem(contractItem) : null,
      events: events.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      ledger: ledger.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    };
  }

  parseDynamoContractItem(item) {
    return {
      soulId: item.soulId?.S || item.PK?.S?.replace('SOUL#', ''),
      status: item.status?.S || item.contract_status?.S || 'Unknown',
      soulType: item.soul_type?.S || item.soulType?.S || null,
      contractLocation: item.contract_location?.S || item.contractLocation?.S || null,
      updatedAt: item.updatedAt?.S || item.createdAt?.S || null,
      createdAt: item.createdAt?.S || null
    };
  }

  parseDynamoEventItem(item) {
    const timestamp = item.timestamp?.S || item.SK?.S?.replace('EVENT#', '') || null;
    return {
      timestamp,
      description: item.description?.S || null
    };
  }

  parseDynamoLedgerItem(item) {
    const timestamp = item.timestamp?.S || item.SK?.S?.replace('LEDGER#', '') || null;
    const amountValue = item.amount?.N ? Number(item.amount.N) : null;
    return {
      timestamp,
      description: item.description?.S || null,
      amount: Number.isFinite(amountValue) ? amountValue : null
    };
  }

  async fetchDsqlSoul(client, soulId) {
    const contractResult = await client.query(
      `SELECT id, contract_status, soul_type, contract_location, updated_at
         FROM soul_contracts
        WHERE id = $1`,
      [soulId]
    );

    let events = [];
    let ledger = [];

    if (this.config.includeEvents) {
      const eventsResult = await client.query(
        `SELECT soul_contract_id, event_time, description
           FROM soul_contract_events
          WHERE soul_contract_id = $1
          ORDER BY event_time`,
        [soulId]
      );
      events = eventsResult.rows.map(row => ({
        timestamp: row.event_time ? toIsoString(row.event_time) : null,
        description: row.description || null
      }));
    }

    if (this.config.includeLedger) {
      const ledgerResult = await client.query(
        `SELECT soul_contract_id, amount, transaction_time, description
           FROM soul_ledger
          WHERE soul_contract_id = $1
          ORDER BY transaction_time`,
        [soulId]
      );
      ledger = ledgerResult.rows.map(row => ({
        timestamp: row.transaction_time ? toIsoString(row.transaction_time) : null,
        description: row.description || null,
        amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null
      }));
    }

    return {
      soulId,
      contract: contractResult.rows[0] ? this.parseDsqlContractRow(contractResult.rows[0]) : null,
      events,
      ledger
    };
  }

  parseDsqlContractRow(row) {
    return {
      soulId: row.id,
      status: row.contract_status || 'Unknown',
      soulType: row.soul_type || null,
      contractLocation: row.contract_location || null,
      updatedAt: row.updated_at ? toIsoString(row.updated_at) : null
    };
  }

  compareSoul(dynamoSoul, dsqlSoul) {
    const issues = [];
    const soulId = dynamoSoul?.soulId || dsqlSoul?.soulId || 'unknown';

    if (!dynamoSoul.contract && !dsqlSoul.contract) {
      issues.push(`Soul ${soulId}: missing in both databases`);
      return issues;
    }

    if (!dynamoSoul.contract) {
      issues.push(`Soul ${soulId}: contract missing in DynamoDB`);
      return issues;
    }

    if (!dsqlSoul.contract) {
      issues.push(`Soul ${soulId}: contract missing in DSQL`);
      return issues;
    }

    const contractDiffs = this.compareContracts(dynamoSoul.contract, dsqlSoul.contract, soulId);
    issues.push(...contractDiffs);

    if (this.config.includeEvents) {
      const eventDiffs = this.compareCollections(
        dynamoSoul.events,
        dsqlSoul.events,
        soulId,
        'events'
      );
      issues.push(...eventDiffs);
    }

    if (this.config.includeLedger) {
      const ledgerDiffs = this.compareCollections(
        dynamoSoul.ledger,
        dsqlSoul.ledger,
        soulId,
        'ledger entries'
      );
      issues.push(...ledgerDiffs);
    }

    return issues;
  }

  compareContracts(dynamoContract, dsqlContract, soulId) {
    const fields = ['status', 'soulType', 'contractLocation'];
    const diffs = [];

    for (const field of fields) {
      const dynamoValue = normalizeValue(dynamoContract[field]);
      const dsqlValue = normalizeValue(dsqlContract[field]);
      if (dynamoValue !== dsqlValue) {
        diffs.push(
          `Soul ${soulId}: contract ${field} mismatch (DynamoDB=${dynamoValue || 'null'}, DSQL=${dsqlValue || 'null'})`
        );
      }
    }

    return diffs;
  }

  compareCollections(dynamoCollection, dsqlCollection, soulId, label) {
    const diffs = [];

    if (dynamoCollection.length !== dsqlCollection.length) {
      diffs.push(
        `Soul ${soulId}: ${label} count mismatch (DynamoDB=${dynamoCollection.length}, DSQL=${dsqlCollection.length})`
      );
    }

    const maxComparisons = Math.min(dynamoCollection.length, dsqlCollection.length);

    for (let i = 0; i < maxComparisons; i++) {
      const dyn = dynamoCollection[i];
      const sql = dsqlCollection[i];

      if (dyn.timestamp !== sql.timestamp) {
        diffs.push(
          `Soul ${soulId}: ${label} timestamp mismatch at index ${i} (DynamoDB=${dyn.timestamp || 'null'}, DSQL=${sql.timestamp || 'null'})`
        );
      }

      if ((dyn.description || '') !== (sql.description || '')) {
        diffs.push(
          `Soul ${soulId}: ${label} description mismatch at index ${i}`
        );
      }

      if (typeof dyn.amount === 'number' || typeof sql.amount === 'number') {
        const dynAmount = Number.isFinite(dyn.amount) ? dyn.amount : null;
        const sqlAmount = Number.isFinite(sql.amount) ? sql.amount : null;
        if (dynAmount !== sqlAmount) {
          diffs.push(
            `Soul ${soulId}: ${label} amount mismatch at index ${i} (DynamoDB=${dynAmount ?? 'null'}, DSQL=${sqlAmount ?? 'null'})`
          );
        }
      }
    }

    return diffs;
  }

  async run() {
    console.log('=== DATA PARITY CHECK ===\n');
    console.log(`AWS Region: ${AWS_REGION}`);
    console.log(`DynamoDB Table: ${TABLE_NAME}`);
    console.log(`DSQL Endpoint: ${DSQL_ENDPOINT}`);
    console.log(`Comparing up to ${this.config.sampleSize} souls`);
    console.log(`Include events: ${this.config.includeEvents ? 'yes' : 'no'}`);
    console.log(`Include ledger: ${this.config.includeLedger ? 'yes' : 'no'}\n`);

    try {
      const soulIds = await this.resolveSoulIds();
      if (!soulIds.length) {
        console.log('No souls found to compare.');
        return;
      }

      const client = await this.connectDSQL();

      for (const soulId of soulIds) {
        const [dynamoSoul, dsqlSoul] = await Promise.all([
          this.fetchDynamoSoul(soulId),
          this.fetchDsqlSoul(client, soulId)
        ]);

        const issues = this.compareSoul(dynamoSoul, dsqlSoul);
        if (issues.length === 0) {
          console.log(`✓ Soul ${soulId}: parity ok`);
        } else {
          console.log(`⚠ Soul ${soulId}: ${issues.length} issue(s)`);
          issues.forEach(issue => console.log(`   - ${issue}`));
          this.mismatches.push(...issues);
        }

        this.checkedSouls += 1;
      }

      console.log('\n=== SUMMARY ===');
      console.log(`Souls checked: ${this.checkedSouls}`);
      console.log(`Mismatches: ${this.mismatches.length}`);

      if (this.mismatches.length === 0) {
        console.log('\n🎉 DynamoDB and DSQL are returning matching results for the sampled souls.');
      } else {
        console.log('\n🚨 Parity differences detected. See details above.');
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('\n❌ Parity check failed:', error.message);
      process.exitCode = 1;
    } finally {
      if (this.dsqlClientPromise) {
        try {
          const client = await this.dsqlClientPromise;
          await client.end();
        } catch (err) {
          // ignore close errors
        }
      }
    }
  }
}

function toIsoString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return String(value);
}

function coercePositiveInt(value) {
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseArgs(argv) {
  const options = { soulsList: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const normalizedKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    if (normalizedKey === 'soul') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        options.soulsList.push(next);
        i += 1;
      }
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[normalizedKey] = true;
    } else {
      options[normalizedKey] = next;
      i += 1;
    }
  }

  return options;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const checker = new DataParityChecker(args);
  checker.run();
}

module.exports = DataParityChecker;
