import { Aspects, CfnResource, Construct, IAspect, IConstruct, RemovalPolicy } from '@aws-cdk/core';

export interface RemovalAspectProps {
  /**
   * cloud constructs set to RemovalPolicy.RETAIN
   */
  readonly inclusionResourceTypes?: Set<CfnResource>;
  /**
   * cloud constructs set to RemovalPolicy.DESTROY
   */
  readonly exclusionResourceTypes?: Set<CfnResource>;
}

/**
 * A CDK aspect that can automatically apply removal policy to all resources within a scope.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html
 */
export class RemovalAspect implements IAspect {
  constructor(private readonly removal: Removal, private readonly props: RemovalAspectProps = { }) {}

  public visit(node: IConstruct): void {
    if (!(node instanceof CfnResource)) {
      return;
    }
    if (this.props.inclusionResourceTypes && this.props.inclusionResourceTypes.has(node)) {
      node.applyRemovalPolicy(RemovalPolicy.RETAIN);
      return;
    }

    if (this.props.exclusionResourceTypes && this.props.exclusionResourceTypes.has(node)) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
      return;
    }

    if (this.removal.props.policy === RemovalPolicy.DESTROY) {
      node.cfnOptions.deletionPolicy && node.applyRemovalPolicy(RemovalPolicy.DESTROY);
      return;
    }
    node.cfnOptions.deletionPolicy && node.applyRemovalPolicy(RemovalPolicy.RETAIN);
  }
}

export interface RemovalProps {
  /**
   * @default - RemovalPolicy.RETAIN
   */
  readonly policy?: RemovalPolicy.RETAIN | RemovalPolicy.DESTROY;
}

export class Removal extends Construct {
  constructor(scope: Construct, id: string, public readonly props: RemovalProps = { }) {
    super(scope, id);
  }

  public applyScope(scope: Construct, options?: RemovalAspectProps) {
    const aspect = new RemovalAspect(this, options);
    Aspects.of(scope).add(aspect);
  }
}
