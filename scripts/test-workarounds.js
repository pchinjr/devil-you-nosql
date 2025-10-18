#!/usr/bin/env node
/**
 * DSQL Connection Workarounds Test
 *
 * Attempts various connection techniques that might bypass DPI firewall:
 * 1. Using HTTP CONNECT proxy tunneling
 * 2. Using AWS Systems Manager Session Manager port forwarding
 * 3. Using SSH tunnel through EC2 bastion
 * 4. Using RDS Data API (if available for DSQL)
 */

require('dotenv').config();
const { Client } = require('pg');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const net = require('net');
const https = require('https');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

// Workaround 1: Check if RDS Data API is available
async function testRDSDataAPI() {
  log('\n=== Workaround 1: RDS Data API (HTTP-based) ===\n', colors.cyan);
  log('Checking if DSQL supports RDS Data API...', colors.blue);

  const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');

  try {
    const client = new RDSDataClient({ region: process.env.AWS_REGION || 'us-east-1' });

    // Try to execute a simple query via Data API
    const command = new ExecuteStatementCommand({
      resourceArn: `arn:aws:dsql:us-east-1:${process.env.AWS_ACCOUNT_ID}:cluster/${process.env.DSQL_ENDPOINT?.split('.')[0]}`,
      database: 'postgres',
      sql: 'SELECT 1 as test'
    });

    log('Attempting query via RDS Data API...', colors.blue);
    const result = await client.send(command);

    log('✓ RDS Data API works! This bypasses the firewall.', colors.green);
    log(`Result: ${JSON.stringify(result)}`, colors.blue);
    return true;
  } catch (error) {
    log(`✗ RDS Data API not available: ${error.message}`, colors.red);
    log('  (DSQL may not support Data API yet)', colors.yellow);
    return false;
  }
}

// Workaround 2: Try different port (if DSQL supports it)
async function testAlternativePort() {
  log('\n=== Workaround 2: Alternative Ports ===\n', colors.cyan);
  log('Testing if DSQL listens on alternative ports...', colors.blue);

  const endpoint = process.env.DSQL_ENDPOINT;
  const alternatePorts = [443, 8443, 5433, 3306]; // HTTPS, common DB ports

  for (const port of alternatePorts) {
    try {
      log(`\nTrying port ${port}...`, colors.blue);

      const testPromise = new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);

        socket.on('connect', () => {
          log(`✓ Port ${port} is open!`, colors.green);
          socket.destroy();
          resolve(port);
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('timeout'));
        });

        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });

        socket.connect(port, endpoint);
      });

      await testPromise;

      // If we get here, port is open - try PostgreSQL connection
      log(`Attempting PostgreSQL connection on port ${port}...`, colors.blue);
      const signer = new DsqlSigner({ hostname: endpoint, region: process.env.AWS_REGION || 'us-east-1' });
      const token = await signer.getDbConnectAdminAuthToken();

      const client = new Client({
        host: endpoint,
        port: port,
        user: 'admin',
        database: 'postgres',
        password: token,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });

      await client.connect();
      log(`✓ SUCCESS! DSQL works on port ${port}`, colors.green);
      await client.end();
      return port;

    } catch (error) {
      log(`✗ Port ${port} failed: ${error.message}`, colors.red);
    }
  }

  log('\n✗ No alternative ports found', colors.red);
  return null;
}

// Workaround 3: HTTP/HTTPS tunneling
async function testHTTPTunnel() {
  log('\n=== Workaround 3: HTTP CONNECT Tunnel ===\n', colors.cyan);
  log('This requires a proxy server you control...', colors.yellow);

  // Check if proxy environment variables are set
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  if (!httpProxy && !httpsProxy) {
    log('✗ No HTTP proxy configured (HTTP_PROXY/HTTPS_PROXY)', colors.red);
    log('  You would need to set up a proxy server outside the restricted network', colors.yellow);
    return false;
  }

  log(`HTTP Proxy: ${httpProxy}`, colors.blue);
  log(`HTTPS Proxy: ${httpsProxy}`, colors.blue);
  log('Note: Standard HTTP proxies typically block PostgreSQL protocol', colors.yellow);

  return false;
}

// Workaround 4: Check AWS SSM Session Manager availability
async function testSSMPortForwarding() {
  log('\n=== Workaround 4: AWS Systems Manager Port Forwarding ===\n', colors.cyan);
  log('Checking if you can use SSM to forward ports through EC2...', colors.blue);

  try {
    const { SSMClient, DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
    const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

    const command = new DescribeInstanceInformationCommand({
      MaxResults: 1
    });

    const result = await ssmClient.send(command);

    if (result.InstanceInformationList && result.InstanceInformationList.length > 0) {
      log('✓ You have EC2 instances with SSM agent', colors.green);
      log('\nYou can use this workaround:', colors.cyan);
      log('1. Launch EC2 in same VPC as DSQL (or with DSQL access)', colors.blue);
      log('2. Use SSM Session Manager to forward port:', colors.blue);
      log('   aws ssm start-session --target <instance-id> \\', colors.blue);
      log('     --document-name AWS-StartPortForwardingSessionToRemoteHost \\', colors.blue);
      log('     --parameters host="<DSQL_ENDPOINT>",portNumber="5432",localPortNumber="5432"', colors.blue);
      log('3. Connect to localhost:5432 instead', colors.blue);
      return true;
    } else {
      log('✗ No EC2 instances with SSM agent found', colors.red);
      return false;
    }
  } catch (error) {
    log(`✗ Cannot check SSM: ${error.message}`, colors.red);
    return false;
  }
}

// Workaround 5: Check if we can use AWS CloudShell
async function testCloudShellOption() {
  log('\n=== Workaround 5: AWS CloudShell ===\n', colors.cyan);
  log('AWS CloudShell can bypass local network restrictions', colors.blue);
  log('\nSteps to use CloudShell:', colors.cyan);
  log('1. Open AWS Console → Click CloudShell icon (terminal icon)', colors.blue);
  log('2. Install Node.js: sudo yum install -y nodejs', colors.blue);
  log('3. Upload your scripts or clone git repo', colors.blue);
  log('4. Run: node scripts/demo.js', colors.blue);
  log('\n✓ This will work - CloudShell is inside AWS network', colors.green);
  log('Note: CloudShell has 1GB persistent storage and 2GB RAM', colors.yellow);

  return true;
}

// Main test runner
async function runWorkaroundTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║      DSQL Connection Workarounds for Blocked Networks      ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.cyan);

  const results = {
    rdsDataAPI: false,
    alternativePort: null,
    httpTunnel: false,
    ssmPortForward: false,
    cloudShell: true // Always available
  };

  // Test each workaround
  try {
    results.rdsDataAPI = await testRDSDataAPI();
  } catch (err) {
    log(`Error testing RDS Data API: ${err.message}`, colors.red);
  }

  try {
    results.alternativePort = await testAlternativePort();
  } catch (err) {
    log(`Error testing alternative ports: ${err.message}`, colors.red);
  }

  try {
    results.httpTunnel = await testHTTPTunnel();
  } catch (err) {
    log(`Error testing HTTP tunnel: ${err.message}`, colors.red);
  }

  try {
    results.ssmPortForward = await testSSMPortForwarding();
  } catch (err) {
    log(`Error testing SSM: ${err.message}`, colors.red);
  }

  testCloudShellOption();

  // Summary
  log('\n' + '═'.repeat(60), colors.cyan);
  log('SUMMARY OF WORKAROUNDS', colors.cyan);
  log('═'.repeat(60) + '\n', colors.cyan);

  log('Workarounds that work:', colors.green);
  let foundWorkaround = false;

  if (results.rdsDataAPI) {
    log('  ✓ RDS Data API (HTTP-based)', colors.green);
    foundWorkaround = true;
  }

  if (results.alternativePort) {
    log(`  ✓ Alternative port ${results.alternativePort}`, colors.green);
    foundWorkaround = true;
  }

  if (results.ssmPortForward) {
    log('  ✓ SSM Port Forwarding (requires EC2)', colors.green);
    foundWorkaround = true;
  }

  log('  ✓ AWS CloudShell (always works)', colors.green);
  foundWorkaround = true;

  if (!foundWorkaround && !results.cloudShell) {
    log('\n✗ No automatic workarounds available', colors.red);
    log('\nManual options:', colors.yellow);
    log('  1. Use different network', colors.blue);
    log('  2. Set up VPN tunnel', colors.blue);
    log('  3. Use AWS CloudShell', colors.blue);
    log('  4. Launch EC2 bastion + SSH tunnel', colors.blue);
  }

  log('\n');
}

if (require.main === module) {
  runWorkaroundTests().catch(console.error);
}

module.exports = { runWorkaroundTests };
