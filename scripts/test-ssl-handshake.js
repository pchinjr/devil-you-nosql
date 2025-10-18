#!/usr/bin/env node
/**
 * SSL/TLS Handshake Diagnostic
 *
 * This script specifically tests the SSL/TLS handshake with DSQL
 * to isolate SSL-level issues from PostgreSQL protocol issues.
 */

require('dotenv').config();
const tls = require('tls');
const { DsqlSigner } = require('@aws-sdk/dsql-signer');

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

async function testSSLHandshake() {
  log('\n=== SSL/TLS Handshake Diagnostic ===\n', colors.cyan);

  const endpoint = process.env.DSQL_ENDPOINT;
  const region = process.env.AWS_REGION || 'us-east-1';

  log(`Testing SSL/TLS connection to: ${endpoint}:5432`, colors.blue);

  return new Promise((resolve, reject) => {
    const options = {
      host: endpoint,
      port: 5432,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      // Enable detailed TLS tracing (not available in all Node.js versions)
      requestCert: false,
      timeout: 15000
    };

    log('\nConnecting with TLS options:', colors.blue);
    log(`  Host: ${options.host}`, colors.blue);
    log(`  Port: ${options.port}`, colors.blue);
    log(`  Min TLS version: ${options.minVersion}`, colors.blue);
    log(`  Timeout: ${options.timeout}ms`, colors.blue);

    const socket = tls.connect(options, () => {
      log('\n✓ SSL/TLS handshake successful!', colors.green);

      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      const cert = socket.getPeerCertificate();

      log('\nConnection details:', colors.cyan);
      log(`  Protocol: ${protocol}`, colors.blue);
      log(`  Cipher: ${cipher.name} (${cipher.version})`, colors.blue);

      if (cert && Object.keys(cert).length > 0) {
        log(`  Server certificate:`, colors.blue);
        log(`    Subject: ${cert.subject?.CN || 'N/A'}`, colors.blue);
        log(`    Issuer: ${cert.issuer?.CN || 'N/A'}`, colors.blue);
        log(`    Valid from: ${cert.valid_from}`, colors.blue);
        log(`    Valid to: ${cert.valid_to}`, colors.blue);
      }

      log('\n✓ SSL connection established, now attempting PostgreSQL startup...', colors.green);

      // Try to send PostgreSQL startup message
      const startupMessage = Buffer.alloc(8);
      startupMessage.writeInt32BE(8, 0); // Message length
      startupMessage.writeInt32BE(80877103, 4); // SSL request code

      socket.write(startupMessage);

      socket.on('data', (data) => {
        log(`\nReceived ${data.length} bytes from server:`, colors.blue);
        log(`  Hex: ${data.toString('hex')}`, colors.blue);
        log(`  ASCII: ${data.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}`, colors.blue);

        // 'S' (0x53) means SSL is supported
        // 'N' (0x4E) means SSL is not supported
        if (data[0] === 0x53) {
          log('\n✓ Server supports SSL', colors.green);
        } else if (data[0] === 0x4E) {
          log('\n✗ Server does not support SSL', colors.red);
        } else {
          log('\n? Unexpected response from server', colors.yellow);
        }

        socket.end();
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      log(`\n✗ SSL/TLS error: ${err.message}`, colors.red);
      log(`  Code: ${err.code}`, colors.red);
      if (err.stack) {
        log(`\n${err.stack}`, colors.yellow);
      }
      reject(err);
    });

    socket.on('timeout', () => {
      log('\n✗ SSL/TLS connection timed out', colors.red);
      socket.destroy();
      reject(new Error('SSL timeout'));
    });

    socket.on('end', () => {
      log('\nSSL connection ended', colors.blue);
    });

    socket.on('close', (hadError) => {
      if (hadError) {
        log('✗ SSL connection closed with error', colors.red);
      } else {
        log('✓ SSL connection closed cleanly', colors.green);
      }
    });

    // Monitor connection progress
    let elapsed = 0;
    const progressInterval = setInterval(() => {
      elapsed += 1000;
      log(`  Still connecting... ${elapsed}ms`, colors.blue);
    }, 1000);

    socket.on('secureConnect', () => {
      clearInterval(progressInterval);
    });

    socket.on('close', () => {
      clearInterval(progressInterval);
    });
  });
}

// Test different SSL/TLS configurations
async function runDiagnostics() {
  try {
    log('Starting SSL/TLS diagnostics...\n', colors.cyan);
    await testSSLHandshake();
    log('\n✓ All SSL diagnostics passed\n', colors.green);
    process.exit(0);
  } catch (error) {
    log('\n✗ SSL diagnostics failed', colors.red);
    log(`Error: ${error.message}\n`, colors.red);
    process.exit(1);
  }
}

if (require.main === module) {
  runDiagnostics();
}
