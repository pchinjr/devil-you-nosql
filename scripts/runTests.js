#!/usr/bin/env node

const BenchmarkSuite = require('./benchmark');
const DataValidator = require('./validate');
const LoadTester = require('./loadTest');

class TestRunner {
  constructor() {
    this.testSuites = {
      benchmark: new BenchmarkSuite(),
      validate: new DataValidator(),
      loadtest: new LoadTester()
    };
  }

  async runAll() {
    console.log('🔥 DEVIL YOU NOSQL - RIGOROUS TESTING SUITE 🔥\n');
    console.log('Testing both the devil you know (NoSQL) and the devil you don\'t (SQL)...\n');
    
    const startTime = Date.now();
    
    try {
      // Run validation first
      console.log('📊 Phase 1: Data Validation');
      console.log('=' .repeat(50));
      await this.testSuites.validate.run();
      
      console.log('\n⚡ Phase 2: Performance Benchmarks');
      console.log('=' .repeat(50));
      await this.testSuites.benchmark.run();
      
      console.log('\n🚀 Phase 3: Load Testing');
      console.log('=' .repeat(50));
      await this.testSuites.loadtest.run();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ All tests completed successfully in ${duration}s`);
      
    } catch (error) {
      console.error('\n❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async runSingle(suiteName) {
    if (!this.testSuites[suiteName]) {
      console.error(`Unknown test suite: ${suiteName}`);
      console.log('Available suites: benchmark, validate, loadtest');
      process.exit(1);
    }
    
    console.log(`Running ${suiteName} suite...\n`);
    await this.testSuites[suiteName].run();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const runner = new TestRunner();
  
  if (args.length === 0) {
    await runner.runAll();
  } else {
    await runner.runSingle(args[0]);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TestRunner;
