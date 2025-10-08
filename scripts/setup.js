/**
 * Setup - Complete database setup and verification
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runSetup() {
  console.log('🚀 DEVIL YOU NOSQL - COMPLETE SETUP');
  console.log('=====================================\n');

  try {
    console.log('📊 Step 1: Verifying databases...');
    await execAsync('node scripts/verifyDatabases.js');
    
    console.log('\n🌱 Step 2: Seeding sample data...');
    await execAsync('node scripts/seedSmall.js');
    
    console.log('\n✅ Setup complete! Ready for demos.');
    console.log('\n🎭 Next steps:');
    console.log('   npm run demo     # Run main demo');
    console.log('   npm run benchmark # Run performance tests');
    console.log('   npm run server   # Start web interface');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runSetup().catch(console.error);
}

module.exports = runSetup;
