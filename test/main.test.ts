import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { DynamoUpdatesStack } from '../src/main';

test('Snapshot', () => {
  const app = new App();
  const stack = new DynamoUpdatesStack(app, 'test');

  expect(stack).not.toHaveResource('AWS::S3::Bucket');
  expect(app.synth().getStackArtifact(stack.artifactId).template).toMatchSnapshot();
});