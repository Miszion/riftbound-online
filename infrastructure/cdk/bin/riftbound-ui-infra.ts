#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RiftboundUiStack } from '../lib/riftbound-ui-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') ?? process.env.DEPLOY_STAGE ?? 'dev';

new RiftboundUiStack(app, `RiftboundUiStack-${stage}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  stage
});
