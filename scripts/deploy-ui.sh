#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${S3_DEPLOY_BUCKET:-}" || -z "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  echo "S3_DEPLOY_BUCKET and CLOUDFRONT_DISTRIBUTION_ID must be set (either env vars or in .env)" >&2
  exit 1
fi

STAGE="${DEPLOY_STAGE:-dev}"

maybe_deploy_infra() {
  local infra_dir="$REPO_ROOT/infrastructure/cdk"
  if [[ ! -d "$infra_dir" ]]; then
    return
  fi

  if git -C "$REPO_ROOT" diff --quiet HEAD -- infrastructure/cdk; then
    echo "No infrastructure changes detected; skipping CDK deployment."
    return
  fi

  echo "Infrastructure changes detected. Deploying CDK stack for stage '${STAGE}'..."
  (
    cd "$infra_dir"
    npm install >/dev/null
    DEPLOY_STAGE="$STAGE" npx cdk deploy "RiftboundUiStack-${STAGE}" --require-approval never
  )
}

maybe_deploy_infra

npm run build:static

aws s3 sync ./out "s3://${S3_DEPLOY_BUCKET}" --delete
aws cloudfront create-invalidation --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" --paths "/*"
