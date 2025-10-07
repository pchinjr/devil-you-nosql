const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

const endpoint = process.env.DSQL_ENDPOINT;
const region = process.env.AWS_REGION || 'us-east-1';

if (!endpoint) {
  console.error('DSQL_ENDPOINT environment variable is required');
  process.exit(1);
}

async function generateToken(endpoint, region) {
  const signer = new DsqlSigner({ hostname: endpoint, region });
  const token = await signer.getDbConnectAdminAuthToken();
  return token;
}

async function clearData() {
  try {
    const token = await generateToken(endpoint, region);
    
    const client = new Client({
      host: endpoint,
      port: 5432,
      database: 'postgres',
      user: 'admin',
      password: token,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    
    await client.query('DELETE FROM soul_ledger');
    await client.query('DELETE FROM soul_contract_events');
    await client.query('DELETE FROM soul_contracts');
    
    console.log('✅ All DSQL tables cleared');
    await client.end();
  } catch (error) {
    console.error('❌ Error clearing data:', error.message);
  }
}

clearData();
