# DevSpec release config — read by the azure-pipelines-release.yml pipeline at
# generation time. Edit the deploy_cmd / smoke_cmd / validate_cmd for each
# environment to match your infrastructure (az / kubectl / helm / terraform /
# etc.). After editing, rerun `devspec ci init --force` so the release pipeline
# picks up the changes.
version: 1

image:
  # Registry, repository, and the service connection are configured in the
  # variables block of azure-pipelines-release.yml (they need an Azure DevOps
  # service connection, which only exists in the project, not in this file).

environments:
  staging:
    url: "https://staging.REPLACE-ME.example.com"
    # validate_cmd runs INSIDE the dev container before deploy. Use it for
    # helm lint, terraform plan, kubectl --dry-run, etc. Leave as `true` to
    # skip validation. Single shell line; multi-line via `\n && \`.
    validate_cmd: "true"
    # deploy_cmd runs on the pipeline agent with $IMAGE_TAG set to the pushed
    # image. Fill in the actual deploy command for your target. The default
    # exits with an error so the pipeline can't silently pass without doing
    # anything.
    deploy_cmd: |
      echo "##vso[task.logissue type=error]Edit .devspec/release.yaml → environments.staging.deploy_cmd"
      echo "Examples:"
      echo "  az containerapp update --name app --resource-group rg-staging --image \$IMAGE_TAG"
      echo "  az webapp config container set --name app --resource-group rg-staging --container-image-name \$IMAGE_TAG"
      echo "  kubectl set image deployment/app app=\$IMAGE_TAG -n staging"
      echo "  helm upgrade --install app ./chart --set image.tag=\$IMAGE_TAG -n staging"
      echo "  terraform -chdir=infra/staging apply -auto-approve -var image=\$IMAGE_TAG"
      exit 1
    # smoke_cmd verifies the deployment after it lands. $DEPLOY_URL is set to
    # the `url` above. Failing here surfaces the alert but doesn't roll back
    # automatically — add your own revert step if you need that.
    smoke_cmd: 'curl -fsS --retry 5 --retry-delay 6 "$DEPLOY_URL/health"'

  production:
    url: "https://REPLACE-ME.example.com"
    validate_cmd: "true"
    deploy_cmd: |
      echo "##vso[task.logissue type=error]Edit .devspec/release.yaml → environments.production.deploy_cmd"
      exit 1
    smoke_cmd: 'curl -fsS --retry 5 --retry-delay 6 "$DEPLOY_URL/health"'
    # Approval is enforced via Pipelines → Environments → production →
    # Approvals and checks. This file does not control approvers — the Azure
    # DevOps Environment does. Set it up there once.

release:
  # `devspec release` uses these to compute the next version bump.
  # Conventional Commits: feat = minor, fix = patch, feat!/BREAKING CHANGE = major
  conventional_commits: true
  # Tag format when `devspec release` cuts a new version
  tag_format: "v{version}"
  # If true, `devspec release` pushes the tag automatically. Set false to
  # require an explicit `git push --tags` step.
  auto_push_tag: false
