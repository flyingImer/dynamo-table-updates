import { Table } from '@aws-cdk/aws-dynamodb';
import { App, Construct, RemovalPolicy, Stack, StackProps } from '@aws-cdk/core';
import { ApiGatewayToDynamoDB } from '@aws-solutions-constructs/aws-apigateway-dynamodb';
import { DefaultTableProps } from '@aws-solutions-constructs/core';

export class DynamoUpdatesStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // define resources here...
    const table = new Table(this, 'Table', {
      ...DefaultTableProps,
      // TODO: enable stream
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new ApiGatewayToDynamoDB(this, 'Gateway', {
      existingTableObj: table,
      logGroupProps: {
        removalPolicy: RemovalPolicy.DESTROY,
      },
      allowReadOperation: true,
      allowCreateOperation: true,
      allowDeleteOperation: true,
      allowUpdateOperation: true,
      createRequestTemplate: "{\r\n  \"TableName\": \"${Table}\",\r\n  \"Item\": {\r\n    \"id\": {\r\n      \"S\": \"$input.path('$.id')\"\r\n    },\r\n    \"EventCount\": {\r\n      \"N\": \"$input.path('$.EventCount')\"\r\n    },\r\n    \"Message\": {\r\n      \"S\": \"$input.path('$.Message')\"\r\n    }\r\n  }\r\n}",
      updateRequestTemplate: "{\r\n  \"TableName\": \"${Table}\",\r\n  \"Key\": {\r\n    \"id\": {\r\n      \"S\": \"$input.path('$.id')\"\r\n    }\r\n  },\r\n  \"ExpressionAttributeValues\": {\r\n    \":event_count\": {\r\n      \"N\": \"$input.path('$.EventCount')\"\r\n    },\r\n    \":message\": {\r\n      \"S\": \"$input.path('$.Message')\"\r\n    }\r\n  },\r\n  \"UpdateExpression\": \"ADD EventCount :event_count SET Message = :message\",\r\n  \"ReturnValues\": \"ALL_NEW\"\r\n}",
    });
  }
}

const app = new App();

new DynamoUpdatesStack(app, 'DynamoUpdatesStack');

app.synth();