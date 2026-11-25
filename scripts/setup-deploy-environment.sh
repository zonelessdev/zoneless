#!/bin/bash
# One-time setup that lets the Deploy workflow deploy to one Google Cloud
# project. GitHub proves which repository a run belongs to and Google issues a
# short-lived token for it, so no key is stored anywhere.
#
# Creates, in the Google Cloud project:
#   - a deploy service account that can deploy Firebase Hosting and, for an
#     API environment, the Cloud Run service
#   - a trust rule that only accepts this repository's main branch
# Creates, in the GitHub repository:
#   - an environment holding the project ID and identity names, all stored as
#     secrets so they are masked in the public run logs
#
# Usage:
#   ./scripts/setup-deploy-environment.sh <environment> <gcp-project> <api-url> [service] [region]
#   ./scripts/setup-deploy-environment.sh docs <gcp-project> <hosting-site>
#
# Examples:
#   ./scripts/setup-deploy-environment.sh test my-project https://api.example.com/v1
#   ./scripts/setup-deploy-environment.sh docs my-project my-docs-site
#
# Set LOG_MASKS to a space-separated list of extra words to hide in the run
# logs of an API environment:
#   LOG_MASKS="acme Acme" ./scripts/setup-deploy-environment.sh ...

set -euo pipefail

ENVIRONMENT="${1:?environment name is required, e.g. test}"
GCP_PROJECT="${2:?Google Cloud project ID is required}"

if [[ "$ENVIRONMENT" == "docs" ]]; then
  HOSTING_SITE="${3:?Firebase Hosting site is required}"
else
  API_URL="${3:?API URL is required, e.g. https://api.example.com/v1}"
  CLOUD_RUN_SERVICE="${4:-zoneless-api}"
  GCP_REGION="${5:-us-central1}"
fi

# Count API calls against this project's quota. By default some gcloud
# commands use a quota shared by all gcloud users, which can be exhausted.
export CLOUDSDK_BILLING_QUOTA_PROJECT="$GCP_PROJECT"

POOL="github"
PROVIDER="github"
DEPLOY_SERVICE_ACCOUNT="github-deploy@${GCP_PROJECT}.iam.gserviceaccount.com"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
# The numeric ID cannot be claimed by another repository after a rename.
REPO_ID="$(gh api "repos/${REPO}" --jq .id)"
PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')"
POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
ROLES=(roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer)

echo "Repository:      $REPO ($REPO_ID)"
echo "Environment:     $ENVIRONMENT"
echo "Project:         $GCP_PROJECT"
if [[ "$ENVIRONMENT" == "docs" ]]; then
  echo "Hosting site:    $HOSTING_SITE"
else
  RUNTIME_SERVICE_ACCOUNT="$(gcloud run services describe "$CLOUD_RUN_SERVICE" \
    --project "$GCP_PROJECT" --region "$GCP_REGION" \
    --format='value(spec.template.spec.serviceAccountName)')"
  ROLES+=(roles/run.sourceDeveloper)
  echo "Cloud Run:       $CLOUD_RUN_SERVICE ($GCP_REGION), runs as $RUNTIME_SERVICE_ACCOUNT"
  echo "API URL:         $API_URL"
fi
read -r -p "Create the deploy identity and GitHub environment? [y/N] " answer
[[ "$answer" == "y" ]] || exit 1

# A new service account takes a few seconds to become visible to IAM.
Retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    "$@" >/dev/null && return
    echo "Retrying in 10 seconds (attempt ${attempt} of 6)..."
    sleep 10
  done
  return 1
}

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  --project "$GCP_PROJECT"

# Anything that already exists is left alone, so the script can be rerun.
gcloud iam workload-identity-pools describe "$POOL" \
  --project "$GCP_PROJECT" --location global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" \
    --project "$GCP_PROJECT" --location global \
    --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project "$GCP_PROJECT" --location global \
  --workload-identity-pool "$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project "$GCP_PROJECT" --location global \
    --workload-identity-pool "$POOL" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository_id == '${REPO_ID}' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts describe "$DEPLOY_SERVICE_ACCOUNT" \
  --project "$GCP_PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "${DEPLOY_SERVICE_ACCOUNT%%@*}" \
    --project "$GCP_PROJECT" --display-name "GitHub deploy"

Retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SERVICE_ACCOUNT" \
  --project "$GCP_PROJECT" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPO_ID}"

for role in "${ROLES[@]}"; do
  Retry gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
    --member "serviceAccount:${DEPLOY_SERVICE_ACCOUNT}" \
    --role "$role" --condition None
done

if [[ "$ENVIRONMENT" != "docs" ]]; then
  # Deploying a revision requires acting as the account the service runs as.
  Retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SERVICE_ACCOUNT" \
    --project "$GCP_PROJECT" \
    --role roles/iam.serviceAccountUser \
    --member "serviceAccount:${DEPLOY_SERVICE_ACCOUNT}"
fi

gh api --method PUT "repos/${REPO}/environments/${ENVIRONMENT}" --silent
gh secret set GCP_PROJECT --env "$ENVIRONMENT" --body "$GCP_PROJECT"
gh secret set WIF_PROVIDER --env "$ENVIRONMENT" --body "${POOL_NAME}/providers/${PROVIDER}"
gh secret set DEPLOY_SERVICE_ACCOUNT --env "$ENVIRONMENT" --body "$DEPLOY_SERVICE_ACCOUNT"
if [[ "$ENVIRONMENT" == "docs" ]]; then
  gh secret set HOSTING_SITE --env "$ENVIRONMENT" --body "$HOSTING_SITE"
  echo "Done. Run the Deploy Docs workflow."
  exit
fi
gh secret set API_URL --env "$ENVIRONMENT" --body "$API_URL"
gh secret set CLOUD_RUN_SERVICE --env "$ENVIRONMENT" --body "$CLOUD_RUN_SERVICE"
gh secret set GCP_REGION --env "$ENVIRONMENT" --body "$GCP_REGION"
if [[ -n "${LOG_MASKS:-}" ]]; then
  gh secret set LOG_MASKS --env "$ENVIRONMENT" --body "$LOG_MASKS"
fi

echo "Done. Run the Deploy workflow and choose \"$ENVIRONMENT\"."
