// eslint-disable-next-line import/no-unresolved
import { DynamoDBStreamEvent } from 'aws-lambda';
// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDB, EventBridge } from 'aws-sdk';

const eventBridge = new EventBridge();

exports.handler = async (event: DynamoDBStreamEvent) => {
  console.log('request:', JSON.stringify(event, undefined, 2));

  await eventBridge.putEvents({
    Entries: event.Records.map((r) => {
      // TODO: handle differently if 'DELETE'
      const item = r.dynamodb?.NewImage ? DynamoDB.Converter.unmarshall(r.dynamodb?.NewImage) : undefined;
      const payload = {
        EventBusName: process.env.EVENT_BUS_ARN,
        Time: r.dynamodb?.ApproximateCreationDateTime ? new Date(r.dynamodb?.ApproximateCreationDateTime * 1000) : undefined,
        Source: r.eventSource,
        Resources: r.eventSourceARN ? [r.eventSourceARN] : undefined,
        DetailType: 'SCHEMA_TYPE_L1_1.0',
        Detail: JSON.stringify({
          schemaType: 'SCHEMA_TYPE_L1',
          schemaVersion: '1.0',
          rid: item?.rid,
          fid: item?.fid,
          eventCount: item?.EventCount,
          message: item?.Message,
        }),
      };
      console.log(payload);
      return payload;
    }),
  }).promise().then((value) => console.log(value)); // TODO: handle failures
};