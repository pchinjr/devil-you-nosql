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
### For DynamoDB version:
sam build --template-file instrumentedDynamoSoulTracker.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml --stack-name InstrumentedDynamoSoulTrackerStack

### For DSQL version:
sam build --template-file instrumentedAuroraSoulTracker.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml --stack-name InstrumentedAuroraSoulTrackerStack

### Replace <API_URL> with the output from the deployment
curl -X POST https://n37d2b7y3g.execute-api.us-east-1.amazonaws.com/Prod/dynamo/souls \
  -H "Content-Type: application/json" \
  -d '{"soulId": "soul-001", "newStatus": "Released", "amount": 100}'

curl -X POST https://n37d2b7y3g.execute-api.us-east-1.amazonaws.com/Prod/dsql/souls \
  -H "Content-Type: application/json" \
  -d '{
    "soulContractId": "soul-123",
    "newStatus": "Released",
    "amount": 150,
    "endpoint": "biabt6nyamlxp6zhjydgrlpd7a.dsql.us-east-1.on.aws"
}'  

https://n37d2b7y3g.execute-api.us-east-1.amazonaws.com/Prod/dynamo/souls
https://n37d2b7y3g.execute-api.us-east-1.amazonaws.com/Prod/dsql/souls

aws cloudformation continue-update-rollback --stack-name devil-nosql --region us-east-1