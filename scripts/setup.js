/**
 * Setup - Complete database setup and verification
 * 
 * Required after SAM deployment to create DSQL tables and indexes
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runSetup() {
  console.log('🚀 DEVIL YOU NOSQL - COMPLETE SETUP');
  console.log('=====================================');
  console.log('Required after SAM deployment to initialize DSQL\n');

  try {
    console.log('🔍 Step 1: Verifying database connectivity...');
    await execAsync('node scripts/verifyDatabases.js');
    console.log('✅ Database connectivity verified\n');

    console.log('🏗️  Step 2: Creating DSQL tables...');
    console.log('(Required: SAM only creates cluster, not tables)');
    await execAsync('node scripts/createSoulTrackerTables.js');
    console.log('✅ DSQL tables created\n');

    console.log('📊 Step 3: Creating DSQL indexes...');
    console.log('(Optional: For optimal performance)');
    await execAsync('node scripts/createDsqlIndexes.js');
    console.log('✅ DSQL indexes created\n');

    console.log('🌱 Step 4: Seeding sample data...');
    await execAsync('node scripts/seedSmall.js');
    console.log('✅ Sample data seeded\n');

    console.log('✅ Step 5: Validating setup...');
    await execAsync('node scripts/validate.js');
    console.log('✅ Setup validation complete\n');

    console.log('🎉 SETUP COMPLETE!');
    console.log('==================');
    console.log('✅ DSQL tables and indexes created');
    console.log('✅ Sample data populated in both databases');
    console.log('✅ Ready for performance demonstrations');
    console.log('');
    console.log('🎭 Next steps:');
    console.log('   npm run demo     # Run philosophy demonstration');
    console.log('   npm run server   # Start web interface');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   • Ensure SAM stack is deployed: sam deploy');
    console.log('   • Check DSQL_ENDPOINT environment variable');
    console.log('   • Verify AWS credentials are configured');
    console.log('   • Ensure Aurora DSQL cluster is ACTIVE');
    process.exit(1);
  }
}

if (require.main === module) {
  runSetup();
}

module.exports = { runSetup };
