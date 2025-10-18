#!/usr/bin/env node
/**
 * DSQL Connection Diagnostic Test
 *
 * This script tests and diagnoses the PostgreSQL client connection process to Aurora DSQL.
 * It provides detailed logging at each step to identify connection issues.
 */

require('dotenv').config();
const { Client } = require('pg');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');

// ANSI color codes for better output visibility
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, colors.cyan);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message) {
  log(`  ${message}`, colors.blue);
}

async function diagnosticConnectionTest() {
  log('\n' + '='.repeat(70), colors.bright);
  log('DSQL CONNECTION DIAGNOSTIC TEST', colors.bright);
  log('='.repeat(70) + '\n', colors.bright);

  let client = null;

  try {
    // Step 1: Verify environment variables
    logStep('1', 'Checking environment variables');
    const endpoint = process.env.DSQL_ENDPOINT;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!endpoint) {
      logError('DSQL_ENDPOINT not found in environment');
      throw new Error('Missing DSQL_ENDPOINT in .env file');
    }

    logSuccess(`DSQL_ENDPOINT: ${endpoint}`);
    logSuccess(`AWS_REGION: ${region}`);

    // Step 2: Generate IAM authentication token
    logStep('2', 'Generating IAM authentication token');
    const startTokenGen = Date.now();

    const signer = new DsqlSigner({
      hostname: endpoint,
      region: region
    });

    logInfo('DsqlSigner initialized');
    logInfo('Calling getDbConnectAdminAuthToken()...');

    const token = await signer.getDbConnectAdminAuthToken();
    const tokenGenTime = Date.now() - startTokenGen;

    logSuccess(`Token generated in ${tokenGenTime}ms`);
    logInfo(`Token length: ${token.length} characters`);
    logInfo(`Token preview: ${token.substring(0, 50)}...`);

    // Parse and decode the token to understand its structure
    logInfo('Token structure analysis:');
    try {
      // DSQL tokens are URL query strings
      const tokenUrl = new URL(`https://${endpoint}/?${token}`);
      const params = tokenUrl.searchParams;

      logInfo(`  Action: ${params.get('Action')}`);
      logInfo(`  Expires: ${params.get('X-Amz-Expires')} seconds`);
      logInfo(`  Algorithm: ${params.get('X-Amz-Algorithm')}`);
      logInfo(`  Credential: ${params.get('X-Amz-Credential')?.substring(0, 30)}...`);
      logInfo(`  Date: ${params.get('X-Amz-Date')}`);
      logInfo(`  Signature present: ${params.has('X-Amz-Signature') ? 'Yes' : 'No'}`);
      logInfo(`  Security token present: ${params.has('X-Amz-Security-Token') ? 'Yes' : 'No'}`);
    } catch (parseErr) {
      logInfo(`  Could not parse token structure: ${parseErr.message}`);
    }

    // Step 3: Create PostgreSQL client configuration
    logStep('3', 'Configuring PostgreSQL client');

    const clientConfig = {
      host: endpoint,
      user: 'admin',
      database: 'postgres',
      password: token,
      port: 5432,
      ssl: {
        rejectUnauthorized: false,
        // Try different SSL/TLS settings
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      },
      connectionTimeoutMillis: 30000,
      query_timeout: 30000,
      // Enable detailed logging
      application_name: 'dsql-diagnostic-test',
      // Try to get more verbose output
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    };

    logInfo('Client configuration:');
    logInfo(`  Host: ${clientConfig.host}`);
    logInfo(`  Port: ${clientConfig.port}`);
    logInfo(`  User: ${clientConfig.user}`);
    logInfo(`  Database: ${clientConfig.database}`);
    logInfo(`  SSL: ${JSON.stringify(clientConfig.ssl)}`);
    logInfo(`  Connection timeout: ${clientConfig.connectionTimeoutMillis}ms`);
    logInfo(`  Query timeout: ${clientConfig.query_timeout}ms`);

    // Step 4: Initialize PostgreSQL client
    logStep('4', 'Initializing PostgreSQL client');
    client = new Client(clientConfig);

    // Add event listeners for diagnostic information
    client.on('error', (err) => {
      logError(`Client error event: ${err.message}`);
    });

    client.on('end', () => {
      logInfo('Client connection ended');
    });

    client.on('notice', (notice) => {
      logInfo(`Server notice: ${notice.message}`);
    });

    logSuccess('Client initialized');

    // Step 4.5: Test raw TCP connectivity (before SSL/PostgreSQL)
    logStep('4.5', 'Testing raw TCP connectivity to endpoint');
    const net = require('net');

    const tcpTestPromise = new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const tcpStart = Date.now();

      socket.setTimeout(10000); // 10 second timeout

      socket.on('connect', () => {
        const tcpTime = Date.now() - tcpStart;
        logSuccess(`Raw TCP connection succeeded in ${tcpTime}ms`);
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        logError('Raw TCP connection timed out (10s)');
        socket.destroy();
        reject(new Error('TCP timeout'));
      });

      socket.on('error', (err) => {
        logError(`Raw TCP connection failed: ${err.message}`);
        socket.destroy();
        reject(err);
      });

      logInfo(`Attempting raw TCP connection to ${endpoint}:5432...`);
      socket.connect(5432, endpoint);
    });

    try {
      await tcpTestPromise;
    } catch (tcpErr) {
      logError('Cannot establish TCP connection - network blocked');
      logInfo('This indicates firewall or network-level blocking');
      throw tcpErr;
    }

    // Step 5: Attempt connection with detailed progress tracking
    logStep('5', 'Connecting to DSQL');
    const startConnect = Date.now();

    logInfo('Attempting TCP connection...');
    logInfo('Connection phases:');
    logInfo('  1. DNS resolution');
    logInfo('  2. TCP handshake (SYN, SYN-ACK, ACK)');
    logInfo('  3. SSL/TLS negotiation');
    logInfo('  4. PostgreSQL authentication');

    // Set up a timeout monitor
    let progressTimer = setInterval(() => {
      const elapsed = Date.now() - startConnect;
      logInfo(`  Still connecting... ${elapsed}ms elapsed`);
    }, 2000);

    try {
      await client.connect();
      clearInterval(progressTimer);

      const connectTime = Date.now() - startConnect;
      logSuccess(`Connected in ${connectTime}ms`);
    } catch (err) {
      clearInterval(progressTimer);
      throw err;
    }

    // Step 6: Verify connection with simple query
    logStep('6', 'Verifying connection with simple query');
    const startPing = Date.now();

    const pingResult = await client.query('SELECT 1 as ping, current_timestamp as server_time');

    const pingTime = Date.now() - startPing;
    logSuccess(`Query executed in ${pingTime}ms`);
    logInfo(`Server response: ping=${pingResult.rows[0].ping}, time=${pingResult.rows[0].server_time}`);

    // Step 7: Check database version
    logStep('7', 'Checking PostgreSQL version');
    const versionResult = await client.query('SELECT version()');
    logSuccess(`Version: ${versionResult.rows[0].version}`);

    // Step 8: List all tables in the database
    logStep('8', 'Listing tables in database');
    const tablesQuery = `
      SELECT
        schemaname,
        tablename,
        tableowner
      FROM pg_catalog.pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename;
    `;

    const tablesResult = await client.query(tablesQuery);

    if (tablesResult.rows.length === 0) {
      logError('No tables found in database');
    } else {
      logSuccess(`Found ${tablesResult.rows.length} table(s)`);
      tablesResult.rows.forEach((row, idx) => {
        logInfo(`  ${idx + 1}. ${row.schemaname}.${row.tablename} (owner: ${row.tableowner})`);
      });
    }

    // Step 9: Verify specific tables exist
    logStep('9', 'Verifying expected tables');
    const expectedTables = ['soul_contracts', 'soul_contract_events', 'soul_ledger'];

    for (const tableName of expectedTables) {
      const checkQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        ) as exists;
      `;

      const checkResult = await client.query(checkQuery, [tableName]);
      const exists = checkResult.rows[0].exists;

      if (exists) {
        logSuccess(`Table '${tableName}' exists`);

        // Get row count
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        logInfo(`  Row count: ${countResult.rows[0].count}`);
      } else {
        logError(`Table '${tableName}' not found`);
      }
    }

    // Step 10: Test query performance
    logStep('10', 'Testing query performance');
    const perfTests = [
      { name: 'Simple SELECT', query: 'SELECT 1' },
      { name: 'Table count', query: 'SELECT COUNT(*) FROM soul_contracts' },
      { name: 'Single row fetch', query: 'SELECT * FROM soul_contracts LIMIT 1' }
    ];

    for (const test of perfTests) {
      try {
        const start = Date.now();
        await client.query(test.query);
        const elapsed = Date.now() - start;
        logSuccess(`${test.name}: ${elapsed}ms`);
      } catch (err) {
        logError(`${test.name} failed: ${err.message}`);
      }
    }

    // Final summary
    log('\n' + '='.repeat(70), colors.bright);
    log('DIAGNOSTIC TEST COMPLETED SUCCESSFULLY', colors.green + colors.bright);
    log('='.repeat(70) + '\n', colors.bright);

    return true;

  } catch (error) {
    logError(`\n${'='.repeat(70)}`);
    logError('DIAGNOSTIC TEST FAILED');
    logError('='.repeat(70));
    logError(`\nError: ${error.message}`);

    if (error.code) {
      logError(`Error code: ${error.code}`);
    }

    if (error.stack) {
      log('\nStack trace:', colors.yellow);
      console.log(error.stack);
    }

    // Provide troubleshooting suggestions
    log('\nTroubleshooting suggestions:', colors.yellow);

    if (error.message.includes('ETIMEDOUT') || error.code === 'ETIMEDOUT') {
      logInfo('- Check network connectivity to DSQL endpoint');
      logInfo('- Verify security group allows inbound traffic on port 5432');
      logInfo('- Try connecting from a different network');
      logInfo('- Check if VPN or firewall is blocking PostgreSQL protocol');
    }

    if (error.message.includes('ENOTFOUND') || error.code === 'ENOTFOUND') {
      logInfo('- Verify DSQL_ENDPOINT is correct in .env file');
      logInfo('- Check DNS resolution for the endpoint');
    }

    if (error.message.includes('authentication') || error.message.includes('password')) {
      logInfo('- Verify AWS credentials are configured correctly');
      logInfo('- Check IAM permissions for DSQL access');
      logInfo('- Try regenerating the authentication token');
    }

    if (error.message.includes('SSL') || error.message.includes('TLS')) {
      logInfo('- SSL/TLS negotiation failed');
      logInfo('- Try updating SSL configuration');
      logInfo('- Verify certificate settings');
    }

    return false;

  } finally {
    // Step 11: Clean up
    if (client) {
      logStep('11', 'Closing connection');
      try {
        await client.end();
        logSuccess('Connection closed cleanly');
      } catch (err) {
        logError(`Error closing connection: ${err.message}`);
      }
    }
  }
}

// Run the diagnostic test
if (require.main === module) {
  diagnosticConnectionTest()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      logError(`Unhandled error: ${error.message}`);
      console.error(error);
      process.exit(1);
    });
}

module.exports = { diagnosticConnectionTest };
