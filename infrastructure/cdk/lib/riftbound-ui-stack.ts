import {
  Stack,
  StackProps,
  RemovalPolicy,
  CfnOutput,
  Duration
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Bucket,
  BlockPublicAccess
} from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  AllowedMethods,
  CachedMethods,
  ViewerProtocolPolicy,
  OriginAccessIdentity,
  HeadersFrameOption,
  CachePolicy,
  CacheHeaderBehavior,
  CacheCookieBehavior,
  CacheQueryStringBehavior,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol
} from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

interface RiftboundUiStackProps extends StackProps {
  stage?: string;
}

export class RiftboundUiStack extends Stack {
  constructor(scope: Construct, id: string, props?: RiftboundUiStackProps) {
    super(scope, id, props);

    const stage = props?.stage ?? this.node.tryGetContext('stage') ?? 'dev';
    const isProd = stage === 'prod';

    const siteBucket = new Bucket(this, 'SiteBucket', {
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd
    });

    const oai = new OriginAccessIdentity(this, 'SiteOAI', {
      comment: `OAI for Riftbound UI ${stage}`
    });
    siteBucket.grantRead(oai);

    const cachePolicy = new CachePolicy(this, 'UiCachePolicy', {
      defaultTtl: Duration.hours(1),
      minTtl: Duration.minutes(1),
      maxTtl: Duration.days(1),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
      cookieBehavior: CacheCookieBehavior.none(),
      headerBehavior: CacheHeaderBehavior.none(),
      queryStringBehavior: CacheQueryStringBehavior.none()
    });

    const headersPolicy = new ResponseHeadersPolicy(this, 'UiResponseHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: HeadersFrameOption.DENY,
          override: true
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true
        }
      }
    });

    const distribution = new Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, {
          originAccessIdentity: oai
        }),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        cachePolicy,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headersPolicy
      },
      defaultRootObject: 'index.html',
      comment: `Riftbound UI ${stage}`,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021
    });

    new CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName
    });

    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName
    });
  }
}
