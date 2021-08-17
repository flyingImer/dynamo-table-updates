// eslint-disable-next-line import/no-unresolved
import { DynamoDBStreamEvent } from 'aws-lambda';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SNS } from 'aws-sdk';

const sns = new SNS();

exports.handler = async (event: DynamoDBStreamEvent) => {
  console.log('request:', JSON.stringify(event, undefined, 2));
  await Promise.all(event.Records.map((r) => sns.publish({
    TopicArn: process.env.SNS_TOPIC_ARN,
    Message: JSON.stringify(r),
  }).promise())).then((values) => {
    console.log(values);
  });
};