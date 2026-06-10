# DevSpec release config — read by the release.yml workflow at generation time.
# Edit the deploy_cmd / smoke_cmd / validate_cmd for each environment to match
# your infrastructure (kubectl / terraform / gcloud / az / aws cli / vercel / etc.).
# After editing, rerun `devspec ci init --force` so release.yml picks up the changes.
version: 1

image:
  registry: ghcr.io
  # repository defaults to "${{ github.repository }}" — leave as is unless using
  # a separate registry path.

environments:
  staging:
    url: "https://staging.REPLACE-ME.example.com"
    # validate_cmd runs INSIDE the dev container before deploy. Use it for
    # helm lint, terraform plan, kubectl --dry-run, etc. Leave as `true` to
    # skip validation. Single shell line; multi-line via `\n && \`.
    validate_cmd: "true"
    # deploy_cmd runs on the GitHub runner with $IMAGE_TAG set to the pushed
    # image. Fill in the actual deploy command for your target. The default
    # exits with an error so the workflow can't silently pass without doing
    # anything.
    deploy_cmd: |
      echo "::error::Edit .devspec/release.yaml → environments.staging.deploy_cmd"
      echo "Examples:"
      echo "  kubectl set image deployment/app app=$IMAGE_TAG -n staging"
      echo "  helm upgrade --install app ./chart --set image.tag=$IMAGE_TAG -n staging"
      echo "  terraform -chdir=infra/staging apply -auto-approve -var image=$IMAGE_TAG"
      echo "  gcloud run deploy app --image=$IMAGE_TAG --region=us-central1"
      echo "  az containerapp update --name app --image $IMAGE_TAG"
      exit 1
    # smoke_cmd verifies the deployment after it lands. $DEPLOY_URL is set to
    # the `url` above. Failing here rolls forward the alert but doesn't roll
    # back automatically — add your own revert step if you need that.
    smoke_cmd: 'curl -fsS --retry 5 --retry-delay 6 "$DEPLOY_URL/health"'

  production:
    url: "https://REPLACE-ME.example.com"
    validate_cmd: "true"
    deploy_cmd: |
      echo "::error::Edit .devspec/release.yaml → environments.production.deploy_cmd"
      exit 1
    smoke_cmd: 'curl -fsS --retry 5 --retry-delay 6 "$DEPLOY_URL/health"'
    # Approval is enforced via GitHub Settings → Environments → production
    # → "Required reviewers". This file does not control approvers — the
    # GitHub Environment does. Set it up there once.

release:
  # `devspec release` uses these to compute the next version bump.
  # Conventional Commits: feat = minor, fix = patch, feat!/BREAKING CHANGE = major
  conventional_commits: true
  # Tag format when `devspec release` cuts a new version
  tag_format: "v{version}"
  # If true, `devspec release` pushes the tag automatically. Set false to
  # require an explicit `git push --tags` step.
  auto_push_tag: false
