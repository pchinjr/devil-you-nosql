# The Devil You NoSQL

A proof-of-concept repository demonstrating two approaches for managing "soul contracts" in a Ghost Rider–themed application:
- A DynamoDB-based Soul Tracker using a single-table design.
- An Aurora DSQL-based Soul Tracker using IAM authentication and standard SQL transactions.

This repository also includes two utility scripts for Aurora DSQL:
- **verifyDsql.js:** Verifies connectivity by inserting and reading test data.
- **createSoulTrackerTables.js:** Creates the necessary tables for the Soul Tracker in Aurora DSQL.

## Repository Structure

```
devil-you-nosql/
├── src/
│   ├── dsqlSoulTracker.ts              # Aurora DSQL-based Soul Tracker Lambda 
│   ├── dynamoSoulTracker.ts            # DynamoDB-based Soul Tracker Lambda 
├── scripts/
│   ├── verifyDsql.js                   # Script to verify Aurora DSQL connectivity (read/write test)
│   └── createSoulTrackerTables.js      # Script to create necessary Aurora DSQL tables for the Soul Tracker
├── template.yaml                       # Combined SAM template to deploy both Lambdas in a single stack
├── package.json                        # Package configuration for Node.js dependencies and build scripts
├── tsconfig.json                       # TypeScript configuration
└── README.md                           # You are here!
```

## Prerequisites

- **Node.js**: Version 20.x or above is recommended.
- **AWS SAM CLI**: Installed and configured ([Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)).
- **AWS Credentials**: Properly configured (e.g., using AWS CLI profiles, environment variables, or IAM roles).
- **Aurora DSQL Cluster**: For the Aurora-based Lambda, ensure you have an Aurora DSQL cluster created and note the cluster endpoint.
- **Environment Variables**:
  - `DSQL_ENDPOINT`: The Aurora DSQL cluster endpoint (e.g., `cluster-abc123.dsql.us-east-1.on.aws`).
  - `AWS_REGION`: The AWS region (defaults to `us-east-1` if not specified).
  - For the DynamoDB Lambda, the table name will be provided via the SAM template parameter (`TableName`).

## Deploying with SAM

This repository uses a single SAM template to deploy both the DynamoDB-based and Aurora DSQL-based Soul Tracker Lambdas.

### Steps:

1. **Build the SAM Application:**

   From the repository root, run:
   ```bash
   sam build --template-file template.yaml
   ```

2. **Deploy the Stack:**

   Use the guided deploy command:
   ```bash
   sam deploy --guided --template-file .aws-sam/build/template.yaml --stack-name DevilYouNoSQLStack
   ```
   
   During deployment, you'll be prompted for parameters:
   
   - **TableName:** (For the DynamoDB table; default is `DevilSoulTracker`)
   - **DSQLEndpoint:** Endpoint for the DSQL Cluster.

3. **Verify Deployment:**

   Once deployed, the SAM template outputs two API URLs:
   - **DynamoApiUrl:** for the DynamoDB-based Soul Tracker (accessible at `/dynamo/souls`)
   - **AuroraApiUrl:** for the Aurora DSQL-based Soul Tracker (accessible at `/dsql/souls`)

   Use curl, Postman, or your browser to test these endpoints.

## Lambdas

### DynamoDB-based Soul Tracker (src/singleTableSoulTracker.ts)
- **Purpose:**  
  Implements a single-table design in DynamoDB that manages soul contracts, events, and ledger entries.
- **Key Features:**
  - Receives API calls at `/dynamo/souls`
  - Executes a multi-item transaction to update a soul contract, log an event, and record a ledger entry.
  - Uses DynamoDB’s `TransactWriteItems` for atomic updates.
- **Deployment:**  
  Deployed via the SAM template parameter `TableName`.

### Aurora DSQL-based Soul Tracker (src/instrumentedAuroraSoulTracker.ts)
- **Purpose:**  
  Implements the same soul contract management but using Aurora DSQL. It uses IAM authentication (via `DsqlSigner`) and a multi-statement SQL transaction for business operations.
- **Key Features:**
  - Receives API calls at `/dsql/souls`
  - Generates an IAM token and connects using the PostgreSQL `pg` client.
  - Uses standard SQL for atomic operations to update a contract, insert an event, and record a ledger entry.
  - Includes performance instrumentation for connection and transaction times.
- **Deployment:**  
  Uses the `DSQL_CONNECTION_STRING` parameter, or alternatively, extracts the endpoint from the event payload.

## Scripts

### verifyDsql.js
- **Purpose:**  
  A standalone Node.js script to verify Aurora DSQL connectivity. It:
  - Generates an IAM token.
  - Connects to Aurora DSQL.
  - Creates a test table, inserts and selects a test record.
  - Drops the test table.
- **Usage:**  
  Set the environment variables `DSQL_ENDPOINT` (and `AWS_REGION`), then run:
  ```bash
  node verifyDsql.js
  ```

### createSoulTrackerTables.js
- **Purpose:**  
  A Node.js script to create (or drop and re-create) the required tables (`soul_contracts`, `soul_contract_events`, `soul_ledger`) in Aurora DSQL. This provides a simple way to bootstrap the schema independent of a CloudFormation custom resource.
- **Usage:**
  Set the environment variables and run:
  ```bash
  node createSoulTrackerTables.js
  ```

## Template YAML

The **template.yaml** file in the repository defines:
- A DynamoDB table for the DynamoDB-based Lambda.
- Two Lambda functions (one for DynamoDB and one for Aurora DSQL).
- API Gateway events for exposing the functions via different routes (`/dynamo/souls` and `/dsql/souls`).
- Necessary IAM policies for each function.

## Cleaning Up

To delete your deployed stack when you're done testing:
```bash
sam delete --stack-name DevilYouNoSQLStack --region <your-region>
```

## Summary

This repository, **devil-you-nosql**, demonstrates two approaches to manage complex transactional workflows (managing soul contracts) for a Ghost Rider–themed application using AWS:
- A DynamoDB-based Lambda with a single-table design.
- An Aurora DSQL-based Lambda using IAM authentication and native SQL transactions.

Both Lambdas are deployed via a single SAM template, and there are supporting Node.js scripts for verifying connectivity and bootstrapping your Aurora DSQL schema.

Enjoy experimenting, and remember: When it comes to managing souls, sometimes you need to confront the devil you know—and the devil you don't!

---

Feel free to modify and extend the README as your project evolves.
# devil-you-nosql
Ghost Rider inspired preview of Aurora DSQL

## Set up
- install dev container dependencies
    - aws cli
    - sam cli 
    - typescript 
- log into aws console and set temporary credentials in env vars
    ```
    export AWS_SECRET_ACCESS_KEY="xxxxxxx"
    export AWS_SESSION_TOKEN="xxxxxx"
    export AWS_DEFAULT_REGION="us-east-1"
    ```
- `npm i -g esbuild` needs global install of esbuild for sam template to build ts to js 
## Deploy with SAM and AWS CLI
```
sam build
sam deploy --guided
```

### Replace <API_URL> with the output from the deployment
curl -X POST https://12s0cyrgck.execute-api.us-east-1.amazonaws.com/Prod/dynamo/souls \
  -H "Content-Type: application/json" \
  -d '{"soulId": "soul-001", "newStatus": "Released", "amount": 100}'

curl -X POST https://12s0cyrgck.execute-api.us-east-1.amazonaws.com/Prod/dsql/souls \
  -H "Content-Type: application/json" \
  -d '{
    "soulContractId": "soul-123",
    "newStatus": "Released",
    "amount": 150,
    "endpoint": "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws"
}'  