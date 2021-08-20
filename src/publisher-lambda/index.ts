// eslint-disable-next-line import/no-unresolved
import { DynamoDBStreamEvent } from 'aws-lambda';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SNS } from 'aws-sdk';

const sns = new SNS();

exports.handler = async (event: DynamoDBStreamEvent) => {
  console.log('request:', JSON.stringify(event, undefined, 2));
  await Promise.all(event.Records.map((r) => sns.publish({
    TopicArn: process.env.SNS_TOPIC_ARN,
    Message: JSON.stringify({
      rid: r.dynamodb?.NewImage?.rid.S,
      fid: r.dynamodb?.NewImage?.fid.S,
      eventCount: r.dynamodb?.NewImage?.EventCount.N,
      message: r.dynamodb?.NewImage?.Message.S,
    }),
  }).promise())).then((values) => {
    console.log(values);
  });
};