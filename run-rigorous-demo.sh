#!/bin/bash

# Devil You NoSQL - Rigorous Demo Runner
# This script demonstrates comprehensive testing of both DynamoDB and Aurora DSQL

set -e

echo "🔥 DEVIL YOU NOSQL - RIGOROUS DEMO 🔥"
echo "Testing both the devil you know (NoSQL) and the devil you don't (SQL)..."
echo ""

# Check required environment variables
if [ -z "$DSQL_ENDPOINT" ]; then
    echo "❌ Error: DSQL_ENDPOINT environment variable is required"
    echo "   Set it to your Aurora DSQL cluster endpoint"
    exit 1
fi

if [ -z "$AWS_REGION" ]; then
    export AWS_REGION="us-east-1"
    echo "ℹ️  Using default AWS region: $AWS_REGION"
fi

echo "Configuration:"
echo "  DSQL Endpoint: $DSQL_ENDPOINT"
echo "  AWS Region: $AWS_REGION"
echo ""

# Function to run with error handling
run_step() {
    local step_name="$1"
    local command="$2"
    
    echo "📋 $step_name"
    echo "Command: $command"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting..."
    
    if eval "$command"; then
        echo "✅ $step_name completed successfully"
    else
        echo "❌ $step_name failed"
        exit 1
    fi
    echo ""
}

# Parse command line arguments
DEMO_TYPE=${1:-"full"}
DATASET_SIZE=${2:-"small"}

case $DEMO_TYPE in
    "quick")
        echo "🚀 Running Quick Demo (validation + basic benchmarks)"
        run_step "Database Verification" "npm run verify"
        run_step "Performance Benchmarks" "npm run test:benchmark"
        ;;
    "small")
        echo "🌱 Running Small Demo (perfect for testing)"
        run_step "Database Verification" "npm run verify"
        run_step "Create DSQL Tables" "node scripts/createSoulTrackerTables.js"
        run_step "Small Dataset Seeding" "npm run seed:small"
        run_step "Create DSQL Indexes" "node scripts/createDsqlIndexes.js"
        run_step "Data Validation" "npm run test:validate"
        run_step "Performance Benchmarks" "npm run test:benchmark"
        ;;
    "load")
        echo "⚡ Running Load Testing Demo"
        run_step "Load Testing" "npm run test:load"
        ;;
    "benchmark")
        echo "📊 Running Benchmark Demo"
        run_step "Performance Benchmarks" "npm run test:benchmark"
        ;;
    "seed")
        echo "🌱 Running Data Seeding"
        if [ "$DATASET_SIZE" = "large" ]; then
            echo "Seeding large dataset (this may take several minutes)..."
            run_step "Large Dataset Seeding" "SOULS_COUNT=1000 EVENTS_PER_SOUL=50 LEDGER_ENTRIES=5000 npm run seed:large"
        else
            run_step "Small Dataset Seeding" "npm run seed:small"
        fi
        ;;
    "philosophy")
        echo "🎭 Running Design Philosophy Demo"
        run_step "Design Philosophy Demonstration" "npm run demo:philosophy"
        ;;
    "full"|*)
        echo "🎯 Running Full Rigorous Demo"
        
        # Step 1: Verify connectivity and schema
        run_step "Database Verification" "npm run verify"
        run_step "Create DSQL Tables" "node scripts/createSoulTrackerTables.js"
        run_step "Create DSQL Indexes" "node scripts/createDsqlIndexes.js"
        
        # Step 2: Seed data
        if [ "$DATASET_SIZE" = "large" ]; then
            echo "🌱 Seeding large dataset for comprehensive testing..."
            run_step "Large Dataset Seeding" "SOULS_COUNT=500 EVENTS_PER_SOUL=25 LEDGER_ENTRIES=2500 npm run seed:large"
        else
            run_step "Small Dataset Seeding (DynamoDB)" "node scripts/seedDynamoSmall.js"
            run_step "Small Dataset Seeding (DSQL)" "node scripts/seedDsqlSmall.js"
        fi
        
        # Step 3: Run comprehensive tests
        run_step "Complete Test Suite" "npm test"
        
        # Step 4: Design Philosophy Demo
        run_step "Design Philosophy Demonstration" "npm run demo:philosophy"
        
        # Step 5: Analytics comparison
        run_step "DynamoDB Analytics" "node scripts/analyticsDynamo.js"
        run_step "DSQL Analytics" "node scripts/analyticsDsql.js"
        ;;
esac

echo "🎉 Demo completed successfully!"
echo ""
echo "🎭 THE PHILOSOPHICAL DIVIDE:"
echo "• DynamoDB: Design-time composition - predictable but rigid"
echo "• Aurora DSQL: Runtime computation - flexible but variable"
echo "• DynamoDB excels at known, stable access patterns"
echo "• DSQL shines for analytical and ad-hoc queries"
echo "• Choose your devil based on your data access philosophy!"
echo ""
echo "Next steps:"
echo "• Review the performance metrics above"
echo "• Try different dataset sizes with: ./run-rigorous-demo.sh full large"
echo "• Experiment with the APIs using the SAM deployment"
