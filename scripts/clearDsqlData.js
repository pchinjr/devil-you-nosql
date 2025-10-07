const { DsqlSigner } = require('@aws-sdk/dsql-signer');
const { Client } = require('pg');

async function clearDsqlData() {
  const endpoint = process.env.DSQL_ENDPOINT;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  const signer = new DsqlSigner({ hostname: endpoint, region });
  const token = await signer.getDbConnectAdminAuthToken();
  
  const client = new Client({
    user: 'admin',
    database: 'postgres',
    host: endpoint,
    password: token,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  
  await client.query('DELETE FROM soul_contract_events');
  await client.query('DELETE FROM soul_ledger');  
  await client.query('DELETE FROM soul_contracts');
  
  console.log('All seeded data cleared from DSQL tables');
  await client.end();
}

clearDsqlData().catch(console.error);
