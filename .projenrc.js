const { AwsCdkTypeScriptApp, ProjectType } = require('projen');

const DEP_CORE_PKG_NAME = '@aws-solutions-constructs/core';
const DEPS_COMPATIBLE_CDK_VERSION = process.env.CDK_DEP_VERSION || '1.117.0';

const project = new AwsCdkTypeScriptApp({
  cdkVersion: DEPS_COMPATIBLE_CDK_VERSION,
  defaultReleaseBranch: 'main',
  name: 'dynamo-table-updates',

  // get the latest dep version (essentially the latest CDK version it supports)
  projenCommand: `CDK_DEP_VERSION=$(yarn info ${DEP_CORE_PKG_NAME} version -s) npx projen`,

  cdkDependencies: [
    '@aws-cdk/aws-apigateway',
    '@aws-cdk/aws-dynamodb',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-lambda-nodejs',
    '@aws-cdk/aws-logs',
    '@aws-cdk/aws-sns',
    '@aws-cdk/aws-sqs',
  ], /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */
  deps: [
    `${DEP_CORE_PKG_NAME}@${DEPS_COMPATIBLE_CDK_VERSION}`,
    `@aws-solutions-constructs/aws-apigateway-dynamodb@${DEPS_COMPATIBLE_CDK_VERSION}`,
    `@aws-solutions-constructs/aws-dynamodbstreams-lambda@${DEPS_COMPATIBLE_CDK_VERSION}`,
    `@aws-solutions-constructs/aws-lambda-sns@${DEPS_COMPATIBLE_CDK_VERSION}`,
    `@aws-solutions-constructs/aws-sns-sqs@${DEPS_COMPATIBLE_CDK_VERSION}`,
  ], /* Runtime dependencies of this module. */
  description: 'An AWS CDK application (fronted by API GW) which integrates the DynamoDB table with stream solutions for near real-time updates to downstream.', /* The description is just a string that helps people understand the purpose of the package. */
  devDeps: [
    '@types/aws-lambda',
    'esbuild@0',
  ], /* Build dependencies for this module. */
  // packageName: undefined,            /* The "name" in package.json. */
  projectType: ProjectType.APP, /* Which type of project this is (library/app). */
  // release: undefined,                /* Add release management to this project. */
});

// FIXME: to work with aws-solutions-constructs today, which only sits on CDK version 1.117.0, forcing this project CDK version to the same
// blocker issue: https://github.com/awslabs/aws-solutions-constructs/issues/117
project.deps.all.filter(dep => dep.name.includes('aws-cdk')).forEach(dep => {
  project.deps.removeDependency(dep.name);
  project.deps.addDependency(`${dep.name}@${DEPS_COMPATIBLE_CDK_VERSION}`, dep.type);
});

project.synth();