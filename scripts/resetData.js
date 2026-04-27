#!/usr/bin/env node

require('dotenv').config();
const {
  DynamoDBClient,
  BatchWriteItemCommand,
  ScanCommand
} = require('@aws-sdk/client-dynamodb');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

class DataReset {
  constructor() {
    this.dynamoClient = new DynamoDBClient({ region: AWS_REGION });
  }

  async resetDynamoDB() {
    console.log(`Clearing DynamoDB table '${TABLE_NAME}'...`);

    let totalDeleted = 0;
    let lastEvaluatedKey;

    do {
      const scan = await this.dynamoClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: lastEvaluatedKey
      }));

      const items = scan.Items || [];
      for (let i = 0; i < items.length; i += 25) {
        let requests = items.slice(i, i + 25).map(item => ({
          DeleteRequest: {
            Key: {
              PK: item.PK,
              SK: item.SK
            }
          }
        }));

        while (requests.length > 0) {
          const response = await this.dynamoClient.send(new BatchWriteItemCommand({
            RequestItems: {
              [TABLE_NAME]: requests
            }
          }));

          requests = response.UnprocessedItems?.[TABLE_NAME] || [];
          if (requests.length > 0) {
            await wait(250);
          }
        }

        totalDeleted += Math.min(25, items.length - i);
      }

      if (totalDeleted > 0 && totalDeleted % 1000 < 25) {
        console.log(`  Deleted ${totalDeleted} DynamoDB items`);
      }

      lastEvaluatedKey = scan.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`DynamoDB cleared (${totalDeleted} items deleted)`);
  }

  async resetDSQL() {
    if (!DSQL_ENDPOINT) {
      throw new Error('DSQL_ENDPOINT is not defined in the environment');
    }

    console.log('Clearing Aurora DSQL tables...');
    const client = await this.connectDSQL();
    await client.connect();

    try {
      await this.deleteDsqlTable(client, 'soul_contract_events', 'id', 'uuid');
      await this.deleteDsqlTable(client, 'soul_ledger', 'id', 'uuid');
      await this.deleteDsqlTable(client, 'soul_contracts', 'id', 'text');
      console.log('Aurora DSQL tables cleared');
    } catch (error) {
      throw error;
    } finally {
      await client.end();
    }
  }

  async deleteDsqlTable(client, tableName, keyColumn, keyType) {
    const batchSize = 1000;
    let totalDeleted = 0;

    while (true) {
      const rows = await client.query(
        `SELECT ${keyColumn} FROM ${tableName} LIMIT ${batchSize}`
      );
      const keys = rows.rows.map(row => row[keyColumn]);

      if (keys.length === 0) {
        break;
      }

      const result = await client.query(
        `DELETE FROM ${tableName} WHERE ${keyColumn} = ANY($1::${keyType}[])`,
        [keys]
      );

      totalDeleted += result.rowCount || keys.length;
      console.log(`  Deleted ${totalDeleted} rows from ${tableName}`);
    }
  }

  async connectDSQL() {
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
    console.log('=== DATA RESET ===');
    console.log(`AWS Region: ${AWS_REGION}`);
    console.log(`DynamoDB Table: ${TABLE_NAME}`);
    console.log(`DSQL Endpoint: ${DSQL_ENDPOINT || '(not set)'}\n`);

    await this.resetDynamoDB();
    await this.resetDSQL();

    console.log('\nData reset complete.');
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  new DataReset().run().catch(error => {
    console.error('Data reset failed:', error);
    process.exit(1);
  });
}

module.exports = DataReset;
