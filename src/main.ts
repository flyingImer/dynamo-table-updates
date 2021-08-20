import * as path from 'path';
import { AttributeType, StreamViewType, Table } from '@aws-cdk/aws-dynamodb';
import { AccountPrincipal, AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Topic } from '@aws-cdk/aws-sns';
import { QueueEncryption } from '@aws-cdk/aws-sqs';
import { App, Construct, RemovalPolicy, Stack, StackProps } from '@aws-cdk/core';
import { ApiGatewayToDynamoDB } from '@aws-solutions-constructs/aws-apigateway-dynamodb';
import { DynamoDBStreamsToLambda } from '@aws-solutions-constructs/aws-dynamodbstreams-lambda';
import { LambdaToSns } from '@aws-solutions-constructs/aws-lambda-sns';
import { SnsToSqs } from '@aws-solutions-constructs/aws-sns-sqs';
import { addProxyMethodToApiResource, DefaultTableProps } from '@aws-solutions-constructs/core';
import { Removal } from './aspect';

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
      stream: StreamViewType.NEW_IMAGE,
    });

    // fronting gateway
    const gateway = new ApiGatewayToDynamoDB(this, 'Gateway', {
      existingTableObj: table,
      allowReadOperation: true,
      allowCreateOperation: true,
      allowUpdateOperation: true,
      createRequestTemplate: '{\r\n  "TableName": "${Table}",\r\n  "Item": {\r\n    ' + this.PRIMARY_KEYS_TEMPLATE + ",\r\n    \"EventCount\": {\r\n      \"N\": \"$input.path('$.EventCount')\"\r\n    },\r\n    \"Message\": {\r\n      \"S\": \"$input.path('$.Message')\"\r\n    }\r\n  }\r\n}",
      updateRequestTemplate: '{\r\n  "TableName": "${Table}",\r\n  "Key": {\r\n    ' + this.PRIMARY_KEYS_TEMPLATE + "\r\n  },\r\n  \"ExpressionAttributeValues\": {\r\n    \":event_count\": {\r\n      \"N\": \"$input.path('$.EventCount')\"\r\n    },\r\n    \":message\": {\r\n      \"S\": \"$input.path('$.Message')\"\r\n    }\r\n  },\r\n  \"UpdateExpression\": \"ADD EventCount :event_count SET Message = :message\",\r\n  \"ReturnValues\": \"ALL_NEW\"\r\n}",
    });
    this.patchDeleteOperation(gateway, table);

    // publish stream records to SNS topic
    const publisher = new NodejsFunction(this, 'Publisher', {
      entry: path.join(__dirname, 'publisher-lambda', 'index.ts'),
      logRetention: RetentionDays.ONE_MONTH,
    });

    // ddb stream
    new DynamoDBStreamsToLambda(this, 'DynamoStream', {
      existingTableInterface: table,
      existingLambdaObj: publisher,
    });

    // throughput first for ImmediateUpdates
    const immediateTopic = new Topic(this, 'ImmediateUpdatesTopic');
    this.applySecureTopicPolicy(immediateTopic);

    new LambdaToSns(this, 'ImmediateUpdates', {
      existingLambdaObj: publisher,
      existingTopicObj: immediateTopic,
    });

    new SnsToSqs(this, 'ImmediateConsumer', {
      enableEncryptionWithCustomerManagedKey: false,
      existingTopicObj: immediateTopic,
      queueProps: {
        encryption: QueueEncryption.UNENCRYPTED,
      },
    });

    // override all configured RemovalPolicy to DESTROY
    new Removal(this, 'Removal', {
      policy: RemovalPolicy.DESTROY,
    }).applyScope(this);
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

  private applySecureTopicPolicy(topic: Topic): void {

    // Apply topic policy to enforce only the topic owner can publish to this topic
    topic.addToResourcePolicy(
      new PolicyStatement({
        sid: 'TopicOwnerOnlyAccess',
        resources: [
          `${topic.topicArn}`,
        ],
        actions: [
          'SNS:Publish',
          'SNS:RemovePermission',
          'SNS:SetTopicAttributes',
          'SNS:DeleteTopic',
          'SNS:ListSubscriptionsByTopic',
          'SNS:GetTopicAttributes',
          'SNS:AddPermission',
        ],
        principals: [new AccountPrincipal(Stack.of(topic).account)],
        effect: Effect.ALLOW,
        conditions:
              {
                StringEquals: {
                  'AWS:SourceOwner': Stack.of(topic).account,
                },
              },
      }),
    );

    // Apply Topic policy to enforce encryption of data in transit
    topic.addToResourcePolicy(
      new PolicyStatement({
        sid: 'HttpsOnly',
        resources: [
          `${topic.topicArn}`,
        ],
        actions: [
          'SNS:Publish',
          'SNS:RemovePermission',
          'SNS:SetTopicAttributes',
          'SNS:DeleteTopic',
          'SNS:ListSubscriptionsByTopic',
          'SNS:GetTopicAttributes',
          'SNS:Receive',
          'SNS:AddPermission',
          'SNS:Subscribe',
        ],
        principals: [new AnyPrincipal()],
        effect: Effect.DENY,
        conditions:
              {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
      }),
    );
  }
}

const app = new App();

new DynamoUpdatesStack(app, 'DynamoUpdatesStack');

app.synth();