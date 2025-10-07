const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'DevilSoulTracker';

async function clearTable() {
  console.log(`Clearing all data from table: ${TABLE_NAME}`);
  
  let lastEvaluatedKey;
  let totalDeleted = 0;
  
  do {
    const scanParams = {
      TableName: TABLE_NAME,
      ProjectionExpression: 'PK, SK',
      ExclusiveStartKey: lastEvaluatedKey
    };
    
    const { Items, LastEvaluatedKey } = await docClient.send(new ScanCommand(scanParams));
    lastEvaluatedKey = LastEvaluatedKey;
    
    if (Items && Items.length > 0) {
      const deleteRequests = Items.map(item => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
      }));
      
      // Process in batches of 25 (DynamoDB limit)
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        await docClient.send(new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: batch }
        }));
        totalDeleted += batch.length;
      }
    }
  } while (lastEvaluatedKey);
  
  console.log(`Deleted ${totalDeleted} items from ${TABLE_NAME}`);
}

clearTable().catch(console.error);
