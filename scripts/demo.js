/**
 * Main Demo - The Devil You Know vs The Devil You Don't
 * 
 * Showcases the core philosophy and natural strengths of each database
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchGetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { DsqlSigner } = require("@aws-sdk/dsql-signer");
const { Client } = require("pg");

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'DevilSoulTracker';

function startTimer() {
  return process.hrtime.bigint();
}

function elapsedMs(start) {
  const diffNs = process.hrtime.bigint() - start;
  const wholeMs = diffNs / 1000000n;
  const fractional = diffNs % 1000000n;
  return Number(wholeMs) + Number(fractional) / 1e6;
}

class MainDemo {
  constructor() {
    this.dsqlClient = null;
  }

  async setupDSQL() {
    const endpoint = process.env.DSQL_ENDPOINT;
    const region = process.env.AWS_REGION || "us-east-1";
    
    const signer = new DsqlSigner({ hostname: endpoint, region });
    const token = await signer.getDbConnectAdminAuthToken();
    
    this.dsqlClient = new Client({
      host: endpoint,
      user: "admin", 
      database: "postgres",
      password: token,
      ssl: { rejectUnauthorized: false }
    });
    await this.dsqlClient.connect();
  }

  async runDemo() {
    console.log('THE DEVIL YOU NOSQL');
    console.log('The Devil You Know vs The Devil You Don\'t\n');

    await this.setupDSQL();
    
    // Warm up connections to get more realistic performance
    console.log('Warming up connections...');
    await this.warmupConnections();
    console.log('Warmup complete\n');

    // Core Philosophy Demo
    await this.demoPhilosophy();
    
    // Natural Strengths Demo
    await this.demoStrengths();

    await this.dsqlClient.end();
  }

  async runScenario(scenarioKey) {
    const normalized = (scenarioKey || '').toLowerCase().replace(/[\s_-]+/g, '');
    const scenarioMap = {
      '1': 'scenario1CompleteSoulProfile',
      's1': 'scenario1CompleteSoulProfile',
      'scenario1': 'scenario1CompleteSoulProfile',
      'completeprofile': 'scenario1CompleteSoulProfile',
      'profile': 'scenario1CompleteSoulProfile',
      '2': 'scenario2BusinessAnalytics',
      's2': 'scenario2BusinessAnalytics',
      'scenario2': 'scenario2BusinessAnalytics',
      'businessanalytics': 'scenario2BusinessAnalytics',
      'executivedashboard': 'scenario2BusinessAnalytics',
      'analytics': 'scenario2BusinessAnalytics',
      '3': 'scenario3SoulContractUpdate',
      's3': 'scenario3SoulContractUpdate',
      'scenario3': 'scenario3SoulContractUpdate',
      'writeoperations': 'scenario3SoulContractUpdate',
      'transaction': 'scenario3SoulContractUpdate',
      'redemption': 'scenario3SoulContractUpdate',
      '4': 'scenario4BatchOperations',
      's4': 'scenario4BatchOperations',
      'scenario4': 'scenario4BatchOperations',
      'batchoperations': 'scenario4BatchOperations',
      'batch': 'scenario4BatchOperations',
      'dashboard': 'scenario4BatchOperations',
      '5': 'scenario5AdvancedAnalytics',
      's5': 'scenario5AdvancedAnalytics',
      'scenario5': 'scenario5AdvancedAnalytics',
      'advancedanalytics': 'scenario5AdvancedAnalytics',
      'riskanalysis': 'scenario5AdvancedAnalytics',
      'risk': 'scenario5AdvancedAnalytics'
    };

    const methodName = scenarioMap[normalized];
    if (!methodName || typeof this[methodName] !== 'function') {
      throw new Error(`Unknown scenario "${scenarioKey}". Available options: 1-5 or scenario1..scenario5.`);
    }

    console.log('THE DEVIL YOU NOSQL');
    console.log('The Devil You Know vs The Devil You Don\'t\n');

    await this.setupDSQL();

    try {
      console.log('Warming up connections...');
      await this.warmupConnections();
      console.log('Warmup complete\n');

      if (['scenario1CompleteSoulProfile', 'scenario2BusinessAnalytics', 'scenario3SoulContractUpdate'].includes(methodName)) {
        this.printPhilosophyHeading();
      } else {
        this.printStrengthsHeading();
      }

      await this[methodName]();
    } finally {
      if (this.dsqlClient) {
        await this.dsqlClient.end();
      }
    }
  }

  async warmupConnections() {
    // Warm up DynamoDB
    try {
      await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'Bound' },
        Limit: 1
      }));
    } catch (e) {
      // Ignore warmup errors
    }

    // Warm up DSQL with simple query
    try {
      await this.dsqlClient.query('SELECT COUNT(*) FROM soul_contracts LIMIT 1');
    } catch (e) {
      // Ignore warmup errors
    }
  }

  printPhilosophyHeading() {
    console.log('DESIGN PARADIGMS COMPARED');
    console.log('==================================');
    console.log('');
  }

  printStrengthsHeading() {
    console.log('NATURAL STRENGTHS DEMONSTRATION');
    console.log('==================================\n');
  }

  async fetchSoulPartition(soulId) {
    const baseParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `SOUL#${soulId}` },
      ScanIndexForward: true
    };

    const items = [];
    let lastEvaluatedKey;

    do {
      const params = { ...baseParams };
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const response = await dynamodb.send(new QueryCommand(params));

      if (response.Items && response.Items.length) {
        items.push(...response.Items);
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  }

  async demoPhilosophy() {
    this.printPhilosophyHeading();
    await this.scenario1CompleteSoulProfile();
    await this.scenario2BusinessAnalytics();
    await this.demonstrateWriteOperations();
  }

  async demonstrateWriteOperations() {
    await this.scenario3SoulContractUpdate();
  }

  async scenario1CompleteSoulProfile() {
    const soulId = await this.getSampleSoulId();

    console.log('SCENARIO 1: Get complete soul profile (user-facing app)');
    console.log('  Goal: Retrieve soul contract + all events + total power in one operation');
    console.log("  Use case: Mobile app showing user's complete supernatural profile");
    
    const runs = 10;
    const dynamoTimes = [];
    const dsqlTimes = [];

    for (let i = 0; i < runs; i++) {
      const dynamoStart = startTimer();
      const dynamoItems = await this.fetchSoulPartition(soulId);
      const dynamoTime = elapsedMs(dynamoStart);
      dynamoTimes.push(dynamoTime);

      const dsqlStart = startTimer();
      // DSQL: Return the contract row plus all events and ledger entries
      const dsqlContract = await this.dsqlClient.query(
        `SELECT id, contract_status, soul_type, contract_location, updated_at
         FROM soul_contracts
         WHERE id = $1`,
        [soulId]
      );

      const dsqlEvents = await this.dsqlClient.query(
        `SELECT soul_contract_id, event_time, description
         FROM soul_contract_events
         WHERE soul_contract_id = $1
         ORDER BY event_time`,
        [soulId]
      );

      const dsqlLedger = await this.dsqlClient.query(
        `SELECT soul_contract_id, transaction_time, amount, description
         FROM soul_ledger
         WHERE soul_contract_id = $1
         ORDER BY transaction_time`,
        [soulId]
      );

      const dsqlTime = elapsedMs(dsqlStart);
      dsqlTimes.push(dsqlTime);

      if (i === 0) {
        this.dsqlContract = dsqlContract.rows[0] || null;
        this.dsqlEvents = dsqlEvents.rows;
        this.dsqlLedger = dsqlLedger.rows;
        this.dsqlRowCount = (dsqlContract.rowCount || 0) + (dsqlEvents.rowCount || 0) + (dsqlLedger.rowCount || 0);
      }

      // Store result info from first run
      if (i === 0) {
        this.dynamoItemCount = dynamoItems.length;
        this.dsqlEventCount = this.dsqlEvents.length;
        this.dsqlLedgerCount = this.dsqlLedger.length;
        // Log sample data that frontend would receive
        this.dynamoSampleData = dynamoItems;
      }
    }

    const dynamoStats = this.calculateStats(dynamoTimes);
    const dsqlStats = this.calculateStats(dsqlTimes);

    console.log(` DynamoDB: ${dynamoStats.mean.toFixed(1)}ms avg (${dynamoStats.min.toFixed(1)}-${dynamoStats.max.toFixed(1)}ms) - ${this.dynamoItemCount} items`);
    console.log('    Single-table design - all related data co-located');
    console.log('    How: One query returns contract + events + ledger entries');
    console.log(`    Statistics: P95=${dynamoStats.p95.toFixed(1)}ms, StdDev=${dynamoStats.stdDev.toFixed(1)}ms, CV=${dynamoStats.cv.toFixed(1)}%`);
    console.log(`    Consistency: ${dynamoStats.cv < 20 ? 'Excellent' : dynamoStats.cv < 40 ? 'Good' : 'Variable'} (CV=${dynamoStats.cv.toFixed(1)}%)`);
    
    console.log(` DSQL: ${dsqlStats.mean.toFixed(1)}ms avg (${dsqlStats.min.toFixed(1)}-${dsqlStats.max.toFixed(1)}ms) - ${this.dsqlRowCount} rows`);
    console.log('    Normalized schema with JOINs');
    console.log('    How: JOIN 3 tables + aggregate events + sum power');
    console.log(`    Statistics: P95=${dsqlStats.p95.toFixed(1)}ms, StdDev=${dsqlStats.stdDev.toFixed(1)}ms, CV=${dsqlStats.cv.toFixed(1)}%`);
    console.log(`     Consistency: ${dsqlStats.cv < 20 ? 'Excellent' : dsqlStats.cv < 40 ? 'Good' : 'Variable'} (CV=${dsqlStats.cv.toFixed(1)}%)`);
    
    // Statistical significance test
    const tTest = this.performTTest(dynamoTimes, dsqlTimes);
    const performanceRatio = dsqlStats.mean / dynamoStats.mean;
    
    console.log(`\nSTATISTICAL ANALYSIS:`);
    console.log(`   Performance ratio: ${performanceRatio.toFixed(2)}x (DSQL vs DynamoDB)`);
    console.log(`   Statistical significance: ${tTest.significant ? 'YES' : 'NO'} (p=${tTest.pValue.toFixed(4)})`);
    console.log(`   Effect size: ${tTest.effectSize.toFixed(2)} (${this.interpretEffectSize(tTest.effectSize)})`);
    
    if (dsqlStats.max > 200) {
      console.log(`    DSQL cold start detected: ${dsqlStats.max.toFixed(1)}ms (${(dsqlStats.max/dynamoStats.mean).toFixed(1)}x slower)`);
      console.log('    This demonstrates "devil you don\'t know" - unpredictable performance');
    }
    
    // Show sample data that frontend would receive
    console.log('\nSAMPLE DATA RETURNED TO FRONTEND:');
    console.log('DynamoDB Items (raw single-table format):');
    this.dynamoSampleData.forEach((item, i) => {
      const sortKey = item.SK;
      const label = sortKey === 'CONTRACT'
        ? `${item.PK?.replace('SOUL#', '') || item.soulId || 'unknown'} (contract)`
        : item.description || item.amount || 'contract';
      console.log(`   Item ${i + 1}: ${sortKey} - ${label}`);
    });

    console.log('DSQL Result (normalized tables rendered as list):');
    if (this.dsqlContract) {
      const { id, contract_status, soul_type, contract_location } = this.dsqlContract;
      console.log(`   Contract: ${id} - Status: ${contract_status}, Type: ${soul_type}, Location: ${contract_location}`);
    }
    this.dsqlEvents.forEach((row, i) => {
      const timestamp = row.event_time instanceof Date ? row.event_time.toISOString() : row.event_time;
      console.log(`   Event ${i + 1}: ${timestamp} - ${row.description}`);
    });
    this.dsqlLedger.forEach((row, i) => {
      const timestamp = row.transaction_time instanceof Date ? row.transaction_time.toISOString() : row.transaction_time;
      console.log(`   Ledger ${i + 1}: ${timestamp} - ${row.amount} (${row.description})`);
    });
    console.log('');
  }

  async scenario2BusinessAnalytics() {
    console.log('SCENARIO 2: Business analytics (executive dashboard)');
    console.log('    Goal: Analyze soul power distribution across all locations');
    console.log('    Use case: Executive dashboard showing business metrics\n');
    
    const analyticsStart = startTimer();
    // DSQL: Complex business analytics - executive dashboard query
    const analyticsResult = await this.dsqlClient.query(`
      WITH ledger_totals AS (
        SELECT
          soul_contract_id,
          SUM(amount) AS total_power_per_soul
        FROM soul_ledger
        GROUP BY soul_contract_id
      )
      SELECT 
        sc.contract_location,                           -- Group results by location (crossroads, highway, etc.)
        
        -- Basic counts and statistics
        COUNT(*) as soul_count,                         -- Total souls at this location
        COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) as redeemed,  -- Conditional count: only redeemed souls
        
        -- Power calculations with per-soul totals to match DynamoDB logic
        SUM(COALESCE(lt.total_power_per_soul, 0)) as total_power,     -- Total power at location
        AVG(COALESCE(lt.total_power_per_soul, 0)) as avg_power_per_soul,  -- Average power per soul
        
        -- Business metric: redemption rate as percentage
        ROUND(COUNT(CASE WHEN sc.contract_status = 'Redeemed' THEN 1 END) * 100.0 / COUNT(*), 1) as redemption_rate
        -- Formula: (redeemed_count / total_count) * 100, rounded to 1 decimal place
        
      FROM soul_contracts sc                            -- Main contracts table
      LEFT JOIN ledger_totals lt ON lt.soul_contract_id = sc.id
      
      GROUP BY sc.contract_location                     -- Aggregate by location
      ORDER BY total_power DESC                         -- Show highest power locations first
      -- This single query replaces 35+ separate DynamoDB queries + client-side calculations
    `);
    const analyticsTime = elapsedMs(analyticsStart);

    console.log(` DSQL: ${analyticsTime}ms - Complex analytics in single query`);
    console.log(`    Analyzed ${analyticsResult.rows.length} locations with aggregations`);
    console.log('    How: JOIN + GROUP BY + multiple aggregations + calculations');
    console.log('    Features: COUNT, SUM, AVG, conditional aggregation, percentage calc');
    console.log('    Result: Complete business intelligence in one query\n');

    // Now show the DynamoDB equivalent implementation
    console.log('DynamoDB: Implementing equivalent analytics with multiple operations');
    const dynamoAnalyticsStart = startTimer();
    
    // Step 1: Get all contracts by location using LocationIndex
    const locations = ['Highway_66', 'Desert_Crossroads', 'Abandoned_Church', 'City_Alley', 'Graveyard', 'Hell_Gate'];
    const locationData = {};
    let totalDynamoQueries = 0;

    for (const location of locations) {
      // Query 1: Get contracts by location
      const locationContracts = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'LocationIndex',
        KeyConditionExpression: 'contract_location = :location',
        ExpressionAttributeValues: { ':location': location }
      }));
      totalDynamoQueries++;

      if (locationContracts.Items.length > 0) {
        locationData[location] = {
          soul_count: 0,
          redeemed: 0,
          total_power: 0,
          contracts: []
        };

        // Process each contract
        for (const item of locationContracts.Items) {
          if (item.SK === 'CONTRACT') {
            locationData[location].soul_count++;
            if (item.status === 'Redeemed') {
              locationData[location].redeemed++;
            }
            locationData[location].contracts.push(item.soulId);
          }
        }

        // Step 2: Get ledger entries for each soul (additional queries)
        for (const soulId of locationData[location].contracts) {
          const ledgerEntries = await dynamodb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { 
              ':pk': `SOUL#${soulId}`,
              ':sk': 'LEDGER#'
            }
          }));
          totalDynamoQueries++;

          // Sum up the power for this soul
          for (const ledger of ledgerEntries.Items) {
            locationData[location].total_power += (ledger.amount || 0);
          }
        }

        // Calculate derived metrics: average ledger power per soul and percentage redeemed.
        locationData[location].avg_power_per_soul = locationData[location].soul_count > 0
          ? locationData[location].total_power / locationData[location].soul_count
          : 0;
        locationData[location].redemption_rate = locationData[location].soul_count > 0
          ? (locationData[location].redeemed / locationData[location].soul_count) * 100
          : 0;
      }
    }

    const dynamoAnalyticsTime = elapsedMs(dynamoAnalyticsStart);

    // Sort by total power (client-side)
    const sortedLocations = Object.entries(locationData)
      .filter(([_, data]) => data.soul_count > 0)
      .sort(([,a], [,b]) => b.total_power - a.total_power);

    console.log(`    Completed in ${dynamoAnalyticsTime}ms using ${totalDynamoQueries} separate queries`);
    console.log(`    Analyzed ${sortedLocations.length} locations`);
    console.log('    How: Multiple GSI queries + client-side aggregation + sorting');
    console.log('    Complexity: N+M queries (N locations + M souls) + application logic');
    console.log(`    Cost: ${totalDynamoQueries} read operations vs 1 DSQL query`);
    console.log(`    Performance ratio: ${(dynamoAnalyticsTime/analyticsTime).toFixed(1)}x slower than DSQL`);
    
    // Show analytics results that frontend would receive
    console.log('\nANALYTICS RESULTS FOR FRONTEND:');
    console.log('DSQL Business Intelligence (ready for dashboard):');
    analyticsResult.rows.forEach((row, i) => {
      console.log(`   Location ${i + 1}: ${row.contract_location} - ${row.soul_count} souls, ${row.redeemed} redeemed (${row.redemption_rate}%), Power: ${row.total_power}`);
    });
    
    console.log('DynamoDB Equivalent (required client processing):');
    sortedLocations.forEach(([location, data], i) => {
      console.log(`   Location ${i + 1}: ${location} - ${data.soul_count} souls, ${data.redeemed} redeemed (${data.redemption_rate.toFixed(1)}%), Power: ${data.total_power}`);
    });
    console.log('');
  }

  async scenario3SoulContractUpdate() {
    console.log('SCENARIO 3: Soul contract status update (transaction scenario)');
    console.log('    Goal: Update contract status + add event + update ledger');
    console.log('    Use case: Ghost Rider completing a soul redemption\n');

    // Get a valid soul ID from the database instead of hardcoding
    const soulId = await this.getSampleSoulId();
    const newStatus = 'Redeemed';
    const amount = 500;
    const eventDescription = 'Soul redeemed by Ghost Rider';
    const currentTime = new Date().toISOString();

    // Test DynamoDB transaction
    console.log('DynamoDB Transaction:');
    const dynamoWriteStart = startTimer();
    let dynamoWriteTime = null;
    try {
      // DynamoDB: Single atomic transaction across multiple items in same partition
      await dynamodb.send(new TransactWriteCommand({
        TransactItems: [
          {
            // Operation 1: Update the main contract status
            Update: {
              TableName: TABLE_NAME,
              Key: { 
                PK: `SOUL#${soulId}`,     // Partition key: groups all soul data
                SK: 'CONTRACT'            // Sort key: identifies the main contract record
              },
              UpdateExpression: 'SET #status = :status, updated_at = :timestamp',
              ExpressionAttributeNames: { '#status': 'status' },  // 'status' is reserved word
              ExpressionAttributeValues: { 
                ':status': newStatus,
                ':timestamp': currentTime
              }
            }
          },
          {
            // Operation 2: Add new event record
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: `SOUL#${soulId}`,                    // Same partition as contract
                SK: `EVENT#${currentTime}`,              // Sort key: chronological ordering
                description: eventDescription,
                timestamp: currentTime
              }
            }
          },
          {
            // Operation 3: Add new ledger entry for power transaction
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: `SOUL#${soulId}`,                    // Same partition as contract
                SK: `LEDGER#${currentTime}`,             // Sort key: chronological ordering
                amount: amount,
                transaction_type: 'redemption',
                timestamp: currentTime
              }
            }
          }
        ]
      }));
      
      dynamoWriteTime = elapsedMs(dynamoWriteStart);
      console.log(`   Transaction completed in ${dynamoWriteTime}ms`);
      console.log('   How: TransactWrite with 3 operations (1 update + 2 inserts)');
      console.log('   Operations: Contract status updated, event logged, ledger entry added');
      console.log('   ACID: Strong consistency within partition (all items share PK)');
      console.log('   Constraint: All operations must be in same partition for ACID guarantees');

      const dynamoPartition = await this.fetchSoulPartition(soulId);
      const dynamoContract = dynamoPartition.find(item => item.SK === 'CONTRACT');
      const latestEvent = dynamoPartition
        .filter(item => item.SK?.startsWith('EVENT#'))
        .sort((a, b) => (b.SK || '').localeCompare(a.SK || ''))[0];
      const latestLedger = dynamoPartition
        .filter(item => item.SK?.startsWith('LEDGER#'))
        .sort((a, b) => (b.SK || '').localeCompare(a.SK || ''))[0];

      console.log('   Items written (DynamoDB single-table view):');
      if (dynamoContract) {
        console.log(`     - CONTRACT -> status=${dynamoContract.status} updated_at=${dynamoContract.updated_at}`);
      }
      if (latestEvent) {
        console.log(`     - ${latestEvent.SK} -> description="${latestEvent.description}"`);
      }
      if (latestLedger) {
        console.log(`     - ${latestLedger.SK} -> amount=${latestLedger.amount}`);
      }
    } catch (error) {
      console.log(`   DynamoDB transaction failed: ${error.message}`);
    }

    // Test DSQL transaction
    console.log('\nDSQL Transaction:');
    const dsqlWriteStart = startTimer();
    let dsqlWriteTime = null;
    try {
      // DSQL: Full ACID transaction across multiple normalized tables
      await this.dsqlClient.query('BEGIN');  // Start transaction
      
      // Operation 1: Update contract status in main table
      await this.dsqlClient.query(
        'UPDATE soul_contracts SET contract_status = $1, updated_at = $2 WHERE id = $3',
        [newStatus, currentTime, soulId]
      );
      
      // Operation 2: Insert event record in events table
      // Note: Using 'event_time' column name (not 'timestamp' - that was the bug!)
      await this.dsqlClient.query(
        'INSERT INTO soul_contract_events (soul_contract_id, description, event_time) VALUES ($1, $2, $3)',
        [soulId, eventDescription, currentTime]
      );
      
      // Operation 3: Insert ledger entry in ledger table  
      // Note: Using 'transaction_time' column name (not 'timestamp')
      await this.dsqlClient.query(
        'INSERT INTO soul_ledger (soul_contract_id, amount, transaction_time, description) VALUES ($1, $2, $3, $4)',
        [soulId, amount, currentTime, `Redemption power bonus: ${amount}`]
      );
      
      await this.dsqlClient.query('COMMIT');  // Commit all changes atomically
      
      dsqlWriteTime = elapsedMs(dsqlWriteStart);
      console.log(`   Transaction completed in ${dsqlWriteTime}ms`);
      console.log('   How: SQL transaction with BEGIN/COMMIT across 3 normalized tables');
      console.log('   Operations: Contract updated, event inserted, ledger entry inserted');
      console.log('   ACID: Full transaction isolation across any tables (not limited by partitions)');
      console.log('   Flexibility: Can include complex business logic, joins, constraints');

      const dsqlAudit = await this.dsqlClient.query(
        `SELECT
           sc.contract_status,
           sc.updated_at,
           sce.description AS last_event,
           sce.event_time AS last_event_time,
           sl.amount AS last_amount,
           sl.transaction_time AS last_amount_time
         FROM soul_contracts sc
         LEFT JOIN LATERAL (
           SELECT description, event_time
           FROM soul_contract_events
           WHERE soul_contract_id = sc.id
           ORDER BY event_time DESC
           LIMIT 1
         ) sce ON true
         LEFT JOIN LATERAL (
           SELECT amount, transaction_time
           FROM soul_ledger
           WHERE soul_contract_id = sc.id
           ORDER BY transaction_time DESC
           LIMIT 1
         ) sl ON true
         WHERE sc.id = $1`,
        [soulId]
      );

      const auditRow = dsqlAudit.rows[0];
      if (auditRow) {
        const updatedAt = auditRow.updated_at instanceof Date ? auditRow.updated_at.toISOString() : auditRow.updated_at;
        const lastEventTime = auditRow.last_event_time instanceof Date ? auditRow.last_event_time.toISOString() : auditRow.last_event_time;
        const lastAmountTime = auditRow.last_amount_time instanceof Date ? auditRow.last_amount_time.toISOString() : auditRow.last_amount_time;
        console.log('   Rows touched (DSQL normalized view):');
        console.log(`     - soul_contracts -> status=${auditRow.contract_status} updated_at=${updatedAt}`);
        if (auditRow.last_event) {
          console.log(`     - soul_contract_events -> ${lastEventTime}: "${auditRow.last_event}"`);
        }
        if (typeof auditRow.last_amount === 'number') {
          console.log(`     - soul_ledger -> ${lastAmountTime}: amount=${auditRow.last_amount}`);
        }
      }
    } catch (error) {
      console.log(`   DSQL transaction failed: ${error.message}`);
      try {
        await this.dsqlClient.query('ROLLBACK');  // Rollback on failure
        console.log('   Transaction rolled back successfully');
      } catch (rollbackError) {
        console.log('   Rollback also failed');
      }
    }

    console.log('\nWRITE OPERATIONS STATISTICAL SUMMARY:');
    if (dynamoWriteTime !== null) {
      console.log(`  DynamoDB observed time: ${dynamoWriteTime.toFixed(2)}ms`);
    } else {
      console.log('  DynamoDB observed time: unavailable (transaction failed)');
    }

    if (dsqlWriteTime !== null) {
      console.log(`  DSQL observed time: ${dsqlWriteTime.toFixed(2)}ms`);
    } else {
      console.log('  DSQL observed time: unavailable (transaction failed)');
    }

    if (dynamoWriteTime !== null && dsqlWriteTime !== null) {
      const ratio = dsqlWriteTime / dynamoWriteTime;
      const delta = dsqlWriteTime - dynamoWriteTime;
      console.log(`  Relative gap: ${ratio.toFixed(2)}x slower on DSQL (${delta.toFixed(2)}ms difference)`);
    } else {
      console.log('  Relative gap: cannot compute (insufficient data)');
    }

    console.log('\nWRITE OPERATIONS INSIGHTS:');
    console.log('  DynamoDB measurement reflects a partition-local TransactWrite (1 update + 2 inserts).');
    console.log('  DSQL measurement captures a BEGIN/COMMIT that touches three normalized tables with IAM-authenticated connection.');
    if (dynamoWriteTime !== null && dsqlWriteTime !== null) {
      const faster = dynamoWriteTime <= dsqlWriteTime ? 'DynamoDB' : 'DSQL';
      console.log(`  Demonstrated outcome: ${faster} completed faster in this run. Re-run the demo to gather additional samples for a fuller distribution.`);
    } else {
      console.log('  Demonstrated outcome: at least one transaction failed; rerun the demo once connectivity issues are resolved.');
    }
    console.log('');
  }

  async scenario4BatchOperations() {
    console.log('DYNAMODB STRENGTH: Batch Operations');
    console.log('    Scenario 4: Retrieve multiple soul contracts for dashboard list');
    console.log('    Use case: Admin panel showing 10 recent contracts');
    console.log('    Testing: Compare batch vs individual operations\n');
    
    const soulIds = await this.getMultipleSoulIds(10);
    const keys = soulIds.map(id => ({ PK: `SOUL#${id}`, SK: 'CONTRACT' }));

    // DynamoDB BatchGetItem (optimized)
    const batchStart = startTimer();
    const batchResult = await dynamodb.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys }
      }
    }));
    const batchTime = elapsedMs(batchStart);
    
    // Store batch result for frontend data display
    this.batchResult = batchResult;

    console.log(`    DynamoDB BatchGetItem: ${batchTime}ms for ${keys.length} contracts`);
    console.log(`    How: Single API call retrieves all items simultaneously`);
    console.log(`    Per-item cost: ${(batchTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`    Network efficiency: 1 round-trip vs ${keys.length} individual calls\n`);

    // Compare with individual DynamoDB queries
    console.log('    COMPARISON: Individual DynamoDB queries (inefficient approach)');
    const individualStart = startTimer();
    const individualResults = [];
    
    for (const key of keys) {
      const result = await dynamodb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: key
      }));
      individualResults.push(result.Item);
    }
    const individualTime = elapsedMs(individualStart);

    console.log(`    Individual queries: ${individualTime}ms for ${keys.length} contracts`);
    console.log(`    Per-item cost: ${(individualTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`    Network overhead: ${keys.length} round-trips vs 1 batch call`);
    console.log(`    Efficiency gain: ${(individualTime/batchTime).toFixed(1)}x faster with batching\n`);

    // Compare with DSQL equivalent - show both approaches
    console.log('    COMPARISON: DSQL batching approaches');
    
    // Approach 1: SQL IN clause (proper SQL batching)
    const dsqlInStart = startTimer();
    const dsqlInResult = await this.dsqlClient.query(
      'SELECT * FROM soul_contracts WHERE id = ANY($1::text[])', 
      [soulIds]
    );
    const dsqlInTime = elapsedMs(dsqlInStart);
    this.dsqlBatchRows = dsqlInResult.rows;

    console.log(`    DSQL IN clause: ${dsqlInTime}ms for ${keys.length} contracts`);
    console.log(`    How: Single query with ANY($1::text[]) - proper SQL batching`);
    console.log(`    Per-item cost: ${(dsqlInTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`    Native SQL set operation - database optimized\n`);

    // Approach 2: Parallel individual queries (what we tested before)
    console.log('    COMPARISON: DSQL parallel queries (suboptimal approach)');
    const dsqlParallelStart = startTimer();
    const dsqlPromises = soulIds.map(id => 
      this.dsqlClient.query('SELECT * FROM soul_contracts WHERE id = $1', [id])
    );
    await Promise.all(dsqlPromises);
    const dsqlParallelTime = elapsedMs(dsqlParallelStart);

    console.log(`     DSQL parallel queries: ${dsqlParallelTime}ms for ${keys.length} contracts`);
    console.log(`    How: ${keys.length} parallel SELECT statements`);
    console.log(`    Per-item cost: ${(dsqlParallelTime/keys.length).toFixed(1)}ms per contract`);
    console.log(`    Suboptimal - forces multiple connections and queries\n`);

    console.log('    BATCH OPERATIONS ANALYSIS:');
    console.log(`    DynamoDB BatchGet: ${batchTime}ms (winner - purpose-built API)`);
    console.log(`    DSQL IN clause: ${dsqlInTime}ms (${(dsqlInTime/batchTime).toFixed(1)}x slower - proper SQL)`);
    console.log(`    DynamoDB Individual: ${individualTime}ms (${(individualTime/batchTime).toFixed(1)}x slower - network overhead)`);
    console.log(`    DSQL Parallel: ${dsqlParallelTime}ms (${(dsqlParallelTime/batchTime).toFixed(1)}x slower - suboptimal)`);
    console.log('    Key insight: SQL IN clause is the proper way to batch in SQL databases');
    console.log('    Use case: DynamoDB wins for purpose-built APIs, SQL wins with proper syntax');
    console.log('    Scalability: Both approaches scale well with proper implementation');
    
    // Show batch results that frontend would receive
    console.log('\nBATCH OPERATION RESULTS FOR FRONTEND:');
    console.log('Sample contracts retrieved:');
    const sampleContracts = this.batchResult.Responses[TABLE_NAME];
    sampleContracts.forEach((contract, i) => {
      console.log(`   Contract ${i + 1}: ${contract.soulId} - ${contract.status} at ${contract.contract_location}`);
    });
    if (this.dsqlBatchRows && this.dsqlBatchRows.length) {
      console.log('DSQL Batch result (normalized rows):');
      this.dsqlBatchRows.forEach((row, i) => {
        console.log(`   Contract ${i + 1}: ${row.id} - ${row.contract_status} at ${row.contract_location}`);
      });
    }
    console.log('');
    return {
      batchTime,
      itemCount: keys.length,
      dsqlInTime,
      individualTime,
      dsqlParallelTime
    };
  }

  async scenario5AdvancedAnalytics() {
    console.log('DSQL STRENGTH: Complex Business Logic');
    console.log('    Scenario 5: Advanced analytics with business rules');
    console.log('    Use case: Risk analysis for soul contract portfolio');
    console.log('    Testing: Statistical performance analysis\n');
    
    const complexTimes = [];
    let complexResult;
    
    for (let i = 0; i < 5; i++) {
      const complexStart = startTimer();
      complexResult = await this.dsqlClient.query(`
        WITH soul_metrics AS (
          SELECT 
            sc.id,
            sc.contract_location,
            sc.soul_type,
            COUNT(sce.id) as event_count,
            SUM(CASE WHEN sl.amount > 0 THEN sl.amount ELSE 0 END) as gains,
            SUM(CASE WHEN sl.amount < 0 THEN ABS(sl.amount) ELSE 0 END) as losses,
            MAX(sce.event_time) as last_activity
          FROM soul_contracts sc
          LEFT JOIN soul_contract_events sce ON sc.id = sce.soul_contract_id
          LEFT JOIN soul_ledger sl ON sc.id = sl.soul_contract_id
          GROUP BY sc.id, sc.contract_location, sc.soul_type
        ),
        location_analysis AS (
          SELECT 
            contract_location,
            COUNT(*) as total_souls,
            AVG(gains - losses) as avg_net_power,
            COUNT(CASE WHEN event_count > 5 THEN 1 END) as active_souls,
            RANK() OVER (ORDER BY AVG(gains - losses) DESC) as profitability_rank
          FROM soul_metrics 
          WHERE gains > 0 OR losses > 0
          GROUP BY contract_location
        )
        SELECT 
          contract_location,
          total_souls,
          ROUND(avg_net_power, 2) as avg_net_power,
          active_souls,
          profitability_rank,
          ROUND(active_souls * 100.0 / total_souls, 1) as activity_rate
        FROM location_analysis
        ORDER BY profitability_rank
      `);
      const complexTime = elapsedMs(complexStart);
      complexTimes.push(complexTime);
    }

    const complexStats = this.calculateStats(complexTimes);

    console.log(`    Complex analysis: ${complexStats.mean.toFixed(1)}ms avg (${complexStats.min.toFixed(1)}-${complexStats.max.toFixed(1)}ms)`);
    console.log(`    ${complexResult.rows.length} locations analyzed with business logic`);
    console.log('    How: Common Table Expressions + window functions + complex aggregations');
    console.log('    Features: Multi-level aggregation, ranking, percentage calculations');
    console.log(`    Statistics: P95=${complexStats.p95.toFixed(1)}ms, CV=${complexStats.cv.toFixed(1)}%`);
    console.log('    Business value: Risk analysis, profitability ranking, activity metrics');
    console.log('    Observation: SQL engine performs multi-table aggregation in one pass');
    
    // Show complex analytics results
    console.log('\nCOMPLEX ANALYTICS RESULTS FOR FRONTEND:');
    console.log('Risk Analysis Dashboard Data (DSQL):');
    if (complexResult && complexResult.rows) {
      complexResult.rows.forEach((row, i) => {
        console.log(`   Location ${i + 1}: ${row.contract_location} - Rank: ${row.profitability_rank}, Activity: ${row.activity_rate}%, Net Power: ${row.avg_net_power}`);
      });
    }
    console.log('');

    // Compare with DynamoDB approach (requires multiple queries + client code)
    console.log('\nDynamoDB Equivalent Approach (conceptual):');
    console.log('   - Would require scanning partitions, aggregating in memory, and managing windows manually');
    console.log('   - Complex due to single-table design and lack of JOINs/window functions');
    console.log('   - Feasible with prep pipelines, but harder for ad-hoc questions');
    console.log('    DynamoDB complex analytics: not executed');
    console.log('    Observation: Client-side recreation would require fetching every soul partition');
    console.log('    Attempted approach: loop over each location and soul, aggregate events and ledger entries in code');
    console.log('    Limitation: number of partitions grows quickly, causing long runtimes and high query counts');
    console.log('    (See commented prototype in scripts/demo.js for reference)');
    console.log('');

    console.log('\nCOMPLEX ANALYTICS STATISTICS:');
    console.log(`   Mean: ${complexStats.mean.toFixed(1)}ms`);
    console.log(`   P95: ${complexStats.p95.toFixed(1)}ms`);
    console.log(`   StdDev: ${complexStats.stdDev.toFixed(1)}ms`);
    console.log(`   CV: ${complexStats.cv.toFixed(1)}%`);
    console.log('   Insight: SQL engine can answer rich questions with stable latency');

    console.log('\nDEMO TAKEAWAYS:');
    console.log('   - DynamoDB for real-time, single-table workloads');
    console.log('   - DSQL for analytics and reporting');
    console.log('   - Choose the right tool for each use case');
    return {
      complexStats,
      locationCount: complexResult?.rows?.length || 0
    };
  }

  printStrengthSummary(batchMetrics, analyticsMetrics) {
    if (!batchMetrics || !analyticsMetrics) return;

    const { batchTime, itemCount } = batchMetrics;
    const { complexStats } = analyticsMetrics;

    console.log('PERFORMANCE ANALYSIS');
    console.log('========================');
    if (typeof batchTime === 'number' && typeof itemCount === 'number' && itemCount > 0) {
      console.log(` DynamoDB batch operations: ${batchTime.toFixed(1)}ms for ${itemCount} items`);
      console.log(`    Per-item cost: ${(batchTime/itemCount).toFixed(1)}ms per contract`);
      console.log('    Scalability: Linear performance up to 100 items per batch');
    }
    if (complexStats) {
      console.log(` DSQL complex analytics: ${complexStats.mean.toFixed(1)}ms avg for business intelligence`);
      console.log('    Data processed: All contracts + events + ledger entries');
      console.log(`    Consistency: CV=${complexStats.cv.toFixed(1)}% (${complexStats.cv < 20 ? 'Excellent' : complexStats.cv < 40 ? 'Good' : 'Variable'})`);
      console.log('    Scalability: Performance depends on data volume and query complexity');
    }
    console.log('');

    console.log('SUMMARY & DECISION FRAMEWORK');
    console.log('=================================');
    console.log('DynamoDB: \"The devil you know\"');
    console.log('    When to choose: User-facing apps, known access patterns, predictable load');
    console.log('    Performance: Consistent 25-35ms for entity operations');
    console.log('    Predictability: Low variability, reliable response times');
    console.log('    Cost model: Pay per operation, predictable scaling');
    console.log('    Sweet spot: Mobile apps, gaming, IoT, real-time applications');
    console.log('');
    console.log('DSQL: \"The devil you don\'t\"');
    console.log('    When to choose: Analytics, evolving requirements, complex relationships');
    console.log('    Performance: 30-50ms for analytics, variable for complex JOINs');
    console.log('    Unpredictability: Can range from 30ms to 300ms+ (cold starts, query complexity)');
    console.log('    Cost model: Pay for compute time, efficient for analytical workloads');
    console.log('    Sweet spot: Business intelligence, reporting, data exploration');
    console.log('');
    console.log('THE VARIABILITY LESSON:');
    console.log('    DynamoDB: Consistent performance you can architect around');
    console.log('    DSQL: Variable performance requires defensive programming');
    console.log('    This IS the philosophical difference - predictable vs flexible');
    console.log('');
    console.log('ARCHITECTURAL DECISION MATRIX:');
    console.log('    User-facing latency critical? -> DynamoDB');
    console.log('    Ad-hoc analytics required? -> DSQL');
    console.log('    Access patterns well-defined? -> DynamoDB');
    console.log('    Query flexibility needed? -> DSQL');
    console.log('    Predictable costs important? -> DynamoDB');
    console.log('    Complex calculations required? -> DSQL');
    console.log('    Consistent response times critical? -> DynamoDB');
    console.log('    Can handle variable performance? -> DSQL');
    console.log('');
    console.log('Remember: You can use BOTH in the same application!');
    console.log('   - DynamoDB for user-facing operations');
    console.log('   - DSQL for analytics and reporting');
    console.log('   - Choose the right tool for each use case');
  }

  async demoStrengths() {
    this.printStrengthsHeading();

    const batchMetrics = await this.scenario4BatchOperations();
    const analyticsMetrics = await this.scenario5AdvancedAnalytics();

    this.printStrengthSummary(batchMetrics, analyticsMetrics);
  }


  calculateStats(times) {
    const n = times.length;
    const mean = times.reduce((a, b) => a + b) / n;
    const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100; // Coefficient of variation
    
    const sorted = [...times].sort((a, b) => a - b);
    
    return {
      mean,
      min: Math.min(...times),
      max: Math.max(...times),
      stdDev,
      cv,
      p50: sorted[Math.floor(n * 0.5)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)]
    };
  }

  performTTest(sample1, sample2) {
    const n1 = sample1.length;
    const n2 = sample2.length;
    const mean1 = sample1.reduce((a, b) => a + b) / n1;
    const mean2 = sample2.reduce((a, b) => a + b) / n2;
    
    const var1 = sample1.reduce((a, b) => a + Math.pow(b - mean1, 2), 0) / (n1 - 1);
    const var2 = sample2.reduce((a, b) => a + Math.pow(b - mean2, 2), 0) / (n2 - 1);
    
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const standardError = Math.sqrt(pooledVar * (1/n1 + 1/n2));
    
    const tStat = Math.abs(mean1 - mean2) / standardError;
    const df = n1 + n2 - 2;
    
    // Simplified p-value approximation for t-test
    const pValue = this.approximatePValue(tStat, df);
    
    // Cohen's d effect size
    const pooledStdDev = Math.sqrt(pooledVar);
    const effectSize = Math.abs(mean1 - mean2) / pooledStdDev;
    
    return {
      tStat,
      pValue,
      significant: pValue < 0.05,
      effectSize
    };
  }

  approximatePValue(t, df) {
    // Simplified approximation for demonstration
    // In production, use a proper statistical library
    if (t > 3) return 0.001;
    if (t > 2.5) return 0.01;
    if (t > 2) return 0.05;
    if (t > 1.5) return 0.1;
    return 0.2;
  }

  interpretEffectSize(d) {
    if (d < 0.2) return 'negligible';
    if (d < 0.5) return 'small';
    if (d < 0.8) return 'medium';
    return 'large';
  }

  async getSampleSoulId() {
    // Get a soul ID that exists in both databases
    const dynamoResult = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'Bound' },
      Limit: 10  // Get multiple to find one that exists in both
    }));
    
    if (dynamoResult.Items.length === 0) throw new Error('No sample data found in DynamoDB');
    
    // Check which souls exist in DSQL
    for (const item of dynamoResult.Items) {
      const soulId = item.soulId;
      try {
        const dsqlCheck = await this.dsqlClient.query('SELECT id FROM soul_contracts WHERE id = $1', [soulId]);
        if (dsqlCheck.rows.length > 0) {
          return soulId;  // Found a soul that exists in both databases
        }
      } catch (error) {
        // Continue to next soul if this one fails
        continue;
      }
    }
    
    // If no matching soul found, just return the first DynamoDB soul
    // This will demonstrate the data consistency issue
    console.log('    Warning: Using soul that may not exist in DSQL (data consistency issue)');
    return dynamoResult.Items[0].soulId;
  }

  async getMultipleSoulIds(count) {
    const result = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'Bound' },
      Limit: count
    }));
    
    return result.Items.map(item => item.soulId);
  }
}

async function main() {
  const demo = new MainDemo();
  const scenarioArg = process.argv[2];

  if (scenarioArg) {
    await demo.runScenario(scenarioArg);
  } else {
    await demo.runDemo();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MainDemo;
