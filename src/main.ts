import { AttributeType, StreamViewType, Table } from '@aws-cdk/aws-dynamodb';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { Code, Runtime } from '@aws-cdk/aws-lambda';
import { App, Construct, RemovalPolicy, Stack, StackProps } from '@aws-cdk/core';
import { ApiGatewayToDynamoDB } from '@aws-solutions-constructs/aws-apigateway-dynamodb';
import { DynamoDBStreamsToLambda } from '@aws-solutions-constructs/aws-dynamodbstreams-lambda';
import { addProxyMethodToApiResource, DefaultTableProps } from '@aws-solutions-constructs/core';

export class DynamoUpdatesStack extends Stack {
  private readonly PARTITION_KEY_NAME = 'rid';
  private readonly PRIMARY_KEYS_TEMPLATE = '"' + this.PARTITION_KEY_NAME +"\": {\r\n      \"S\": \"$input.path('$.rid')\"\r\n    },\r\n    \"fid\": {\r\n      \"S\": \"$input.path('$.fid')\"\r\n    }";
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // define resources here...

    // core table
    const table = new Table(this, 'Table', {
      ...DefaultTableProps,
      partitionKey: {
        name: this.PARTITION_KEY_NAME,
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'fid',
        type: AttributeType.STRING,
      },
      stream: StreamViewType.KEYS_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // fronting gateway
    const gateway = new ApiGatewayToDynamoDB(this, 'Gateway', {
      existingTableObj: table,
      logGroupProps: {
        removalPolicy: RemovalPolicy.DESTROY,
      },
      allowReadOperation: true,
      allowCreateOperation: true,
      allowUpdateOperation: true,
      createRequestTemplate: '{\r\n  "TableName": "${Table}",\r\n  "Item": {\r\n    ' + this.PRIMARY_KEYS_TEMPLATE + ",\r\n    \"EventCount\": {\r\n      \"N\": \"$input.path('$.EventCount')\"\r\n    },\r\n    \"Message\": {\r\n      \"S\": \"$input.path('$.Message')\"\r\n    }\r\n  }\r\n}",
      updateRequestTemplate: '{\r\n  "TableName": "${Table}",\r\n  "Key": {\r\n    ' + this.PRIMARY_KEYS_TEMPLATE + "\r\n  },\r\n  \"ExpressionAttributeValues\": {\r\n    \":event_count\": {\r\n      \"N\": \"$input.path('$.EventCount')\"\r\n    },\r\n    \":message\": {\r\n      \"S\": \"$input.path('$.Message')\"\r\n    }\r\n  },\r\n  \"UpdateExpression\": \"ADD EventCount :event_count SET Message = :message\",\r\n  \"ReturnValues\": \"ALL_NEW\"\r\n}",
    });
    this.patchDeleteOperation(gateway, table);

    // ddb stream
    new DynamoDBStreamsToLambda(this, 'DynamoStream', {
      existingTableInterface: table,
      lambdaFunctionProps: {
        code: Code.fromAsset(`${__dirname}/lambda`),
        runtime: Runtime.NODEJS_12_X,
        handler: 'index.handler',
      },
    });
  }

  /**
   * Due to the dependency construct does not work well with sort key enabled DDB table,
   * patching the 'DELETE' operation separately.
   */
  private patchDeleteOperation(gateway: ApiGatewayToDynamoDB, table: Table) {
    gateway.apiGatewayRole.addToPolicy(new PolicyStatement({
      resources: [
        table.tableArn,
      ],
      actions: ['dynamodb:DeleteItem'],
    }));
    gateway.apiGateway.methods.push(addProxyMethodToApiResource({
      service: 'dynamodb',
      action: 'DeleteItem',
      apiGatewayRole: gateway.apiGatewayRole,
      apiMethod: 'DELETE',
      apiResource: gateway.apiGateway.root.getResource(`{${this.PARTITION_KEY_NAME}}`)!,
      requestTemplate: '{\r\n  "TableName": "' + table.tableName + '",\r\n  "Key": {\r\n    ' + this.PRIMARY_KEYS_TEMPLATE + '  },\r\n  "ConditionExpression": "attribute_not_exists(Replies)",\r\n  "ReturnValues": "ALL_OLD"\r\n}',
    }));
  }
}

const app = new App();

new DynamoUpdatesStack(app, 'DynamoUpdatesStack');

app.synth();