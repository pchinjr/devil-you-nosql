#!/usr/bin/env node
/**
 * Test DSQL connection WITHOUT SSL
 *
 * This will fail (DSQL requires SSL), but it will help us understand
 * if the network is specifically blocking SSL connections.
 */

require('dotenv').config();
const { Client } = require('pg');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');

async function testWithoutSSL() {
  console.log('\n=== Testing DSQL Connection WITHOUT SSL ===\n');
  console.log('NOTE: This will fail (DSQL requires SSL)');
  console.log('Purpose: Determine if network blocks SSL specifically\n');

  const endpoint = process.env.DSQL_ENDPOINT;
  const region = process.env.AWS_REGION || 'us-east-1';

  const signer = new DsqlSigner({ hostname: endpoint, region });
  const token = await signer.getDbConnectAdminAuthToken();

  const client = new Client({
    host: endpoint,
    user: 'admin',
    database: 'postgres',
    password: token,
    port: 5432,
    ssl: false, // Explicitly disable SSL
    connectionTimeoutMillis: 10000
  });

  console.log('Attempting connection WITHOUT SSL...');
  const start = Date.now();

  try {
    await client.connect();
    const elapsed = Date.now() - start;
    console.log(`✓ Connected in ${elapsed}ms (unexpected!)`);
    await client.end();
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(`✗ Failed after ${elapsed}ms`);
    console.log(`Error: ${error.message}`);
    console.log(`Code: ${error.code}`);

    if (error.code === 'ECONNRESET') {
      console.log('\n→ Connection RESET - Server/network actively rejected non-SSL connection');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n→ Connection TIMEOUT - Network may be silently dropping packets');
    } else if (error.message.includes('SSL')) {
      console.log('\n→ Server requires SSL (expected behavior)');
    }
  }
}

testWithoutSSL().catch(console.error);
