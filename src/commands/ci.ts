import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { readDevspecConfig, readTechStack } from "../core/config.js";
import { fragmentPath } from "../core/templates.js";
import { nextStep } from "../core/hints.js";

export const ciCommand = new Command("ci").description(
  "Generate continuous-integration scaffolding for DevSpec checks"
);

ciCommand
  .command("init")
  .description(
    "Write .github/workflows/ci.yml + a PR template that wires DevSpec checks into GitHub Actions"
  )
  .option("--force", "Overwrite existing files", false)
  .option(
    "--platform <name>",
    "CI platform (defaults to workspace pipeline fragment, falls back to `github`)"
  )
  .action(async (options: { force: boolean; platform?: string }) => {
    const root = await requireWorkspaceRoot();
    const config = await readDevspecConfig(root);

    const platform = options.platform ?? config.pipeline ?? "github";

    if (platform !== "github") {
      console.error(
        chalk.red(
          `Unsupported pipeline platform "${platform}". Only "github" ships in v1. Add a fragment at src/packs/pipeline/<name>/ to extend.`
        )
      );
      process.exitCode = 1;
      return;
    }

    // The release config must exist (or be scaffolded) BEFORE we render the
    // release workflow, because the workflow substitutes values from it.
    const releaseConfigPath = devspecPath(root, "release.yaml");
    const releaseConfigRel = path.relative(root, releaseConfigPath);
    let releaseConfigScaffolded = false;
    if (!(await fs.pathExists(releaseConfigPath))) {
      const scaffoldPath = fragmentPath(
        "pipeline",
        platform,
        "templates",
        "release.yaml.tpl"
      );
      if (await fs.pathExists(scaffoldPath)) {
        await fs.ensureDir(path.dirname(releaseConfigPath));
        await fs.writeFile(releaseConfigPath, await fs.readFile(scaffoldPath, "utf8"));
        releaseConfigScaffolded = true;
      }
    }

    const { workflow, releaseWorkflow, prTemplate, source } = await loadTemplates(root, platform);

    const targets: { rel: string; abs: string; content: string }[] = [
      {
        rel: ".github/workflows/ci.yml",
        abs: path.join(root, ".github", "workflows", "ci.yml"),
        content: workflow,
      },
      {
        rel: ".github/pull_request_template.md",
        abs: path.join(root, ".github", "pull_request_template.md"),
        content: prTemplate,
      },
    ];

    if (releaseWorkflow) {
      targets.push({
        rel: ".github/workflows/release.yml",
        abs: path.join(root, ".github", "workflows", "release.yml"),
        content: releaseWorkflow,
      });
    }

    // Backward-compat: previously ci init wrote devspec.yml. If that file
    // exists, leave it alone but flag it so the user can delete it after
    // verifying ci.yml works.
    const legacyWorkflow = path.join(root, ".github", "workflows", "devspec.yml");
    const hasLegacy = await fs.pathExists(legacyWorkflow);

    let written = 0;
    let skipped = 0;

    for (const target of targets) {
      if ((await fs.pathExists(target.abs)) && !options.force) {
        console.log(chalk.yellow(`  skip   ${target.rel} (exists, use --force)`));
        skipped++;
        continue;
      }
      await fs.ensureDir(path.dirname(target.abs));
      await fs.writeFile(target.abs, target.content);
      console.log(chalk.green(`  write  ${target.rel}`));
      written++;
    }

    console.log("");
    console.log(`Done. ${written} written, ${skipped} skipped.`);
    console.log(chalk.dim(`Source: ${source}`));

    if (releaseConfigScaffolded) {
      console.log(chalk.green(`  write  ${releaseConfigRel}  (release config — edit deploy_cmd per env)`));
    } else if (await fs.pathExists(releaseConfigPath)) {
      console.log(chalk.dim(`  keep   ${releaseConfigRel}  (release config — unchanged)`));
    }

    if (hasLegacy) {
      console.log("");
      console.log(
        chalk.yellow(
          `  note: .github/workflows/devspec.yml from an older devspec exists — delete it once ci.yml is verified.`
        )
      );
    }

    if (written > 0) {
      console.log("");
      console.log(chalk.dim("Important — workflows have placeholder install steps for devspec."));
      console.log(chalk.dim("Edit .github/workflows/ci.yml + release.yml and choose the install method that fits"));
      console.log(chalk.dim("your repo (npm, git clone, pre-built binary). The release.yml deploy_cmd entries"));
      console.log(chalk.dim(`in ${releaseConfigRel} also need to be filled in for your deploy target.`));
      console.log("");
      nextStep(
        `commit + push, enable required status checks (security, quality, test-unit, test-integration, test-e2e, devspec) in GitHub branch protection, then create the 'staging' and 'production' Environments under repo Settings (production with required reviewers)`
      );
    }
  });

async function loadTemplates(
  root: string,
  platform: string
): Promise<{
  workflow: string;
  releaseWorkflow: string | null;
  prTemplate: string;
  source: string;
}> {
  const fragWorkflow = fragmentPath("pipeline", platform, "templates", "workflow.yml.tpl");
  const fragRelease = fragmentPath("pipeline", platform, "templates", "release.yml.tpl");
  const fragPrTemplate = fragmentPath(
    "pipeline",
    platform,
    "templates",
    "pull-request-template.md"
  );

  const hasFragment = (await fs.pathExists(fragWorkflow)) && (await fs.pathExists(fragPrTemplate));
  if (!hasFragment) {
    return {
      workflow: FALLBACK_WORKFLOW,
      releaseWorkflow: null,
      prTemplate: FALLBACK_PR_TEMPLATE,
      source: "fallback (no pipeline fragment found)",
    };
  }

  const techStack = await readTechStack(root);
  const config = await readDevspecConfig(root);
  // Read .devspec/release.yaml so release.yml.tpl can substitute its values.
  // ci init's caller scaffolds this file before loadTemplates runs.
  const releaseConfigPath = devspecPath(root, "release.yaml");
  let releaseConfig: Record<string, unknown> = {};
  if (await fs.pathExists(releaseConfigPath)) {
    try {
      releaseConfig = (YAML.parse(await fs.readFile(releaseConfigPath, "utf8")) ?? {}) as Record<
        string,
        unknown
      >;
    } catch {
      releaseConfig = {};
    }
  }

  const vars = {
    ...techStack,
    has_frontend: Boolean(config.frontend),
    release: releaseConfig,
  } as Record<string, unknown>;

  const workflowTpl = await fs.readFile(fragWorkflow, "utf8");
  const prTpl = await fs.readFile(fragPrTemplate, "utf8");
  const releaseTpl = (await fs.pathExists(fragRelease))
    ? await fs.readFile(fragRelease, "utf8")
    : null;

  return {
    workflow: substituteTemplate(workflowTpl, vars),
    releaseWorkflow: releaseTpl ? substituteTemplate(releaseTpl, vars) : null,
    prTemplate: substituteTemplate(prTpl, vars),
    source: `pipeline/${platform} fragment`,
  };
}

function substituteTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (full, expr) => {
    const dotted = String(expr).trim();
    const resolved = resolveDotPath(vars, dotted);
    if (resolved === undefined) return full;
    if (typeof resolved === "boolean") return resolved ? "true" : "false";
    return String(resolved);
  });
}

function resolveDotPath(obj: Record<string, unknown>, p: string): unknown {
  return p.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// Used only when no pipeline fragment is configured AND the fragment files are
// missing. This is intentionally minimal — just devspec gates. Configure the
// pipeline axis (`devspec init --pipeline github`) to get the full
// security/quality/test enforcement template.
const FALLBACK_WORKFLOW = `# Generated by \`devspec ci init\` (fallback — no pipeline fragment configured).
# For the full security + quality + test enforcement workflow, run:
#   devspec init --force --pipeline github  (along with your other axes)
# then \`devspec ci init --force\`.
name: devspec

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    name: devspec check + coherence
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install devspec
        run: |
          echo "::error::Edit .github/workflows/ci.yml and choose a devspec install method"
          exit 1

      - run: devspec --version
      - run: devspec doctor
      - run: devspec check
      - name: Coherence per active change
        run: |
          set -e
          shopt -s nullglob
          had_drift=0
          for dir in .devspec/projects/*/; do
            slug="$(basename "$dir")"
            echo "::group::coherence $slug"
            if ! devspec coherence "$slug" --json --block-only > /dev/null; then
              echo "::error title=DevSpec drift in $slug::Run \\\`devspec coherence $slug\\\` locally to see details."
              had_drift=1
            fi
            echo "::endgroup::"
          done
          if [ "$had_drift" -ne 0 ]; then exit 1; fi
`;

const FALLBACK_PR_TEMPLATE = `## Linked DevSpec change

- Change slug: \`<slug>\`
- Spec docs: \`.devspec/projects/<slug>/\`

## Spec checklist

- [ ] \`discovery.md\` has substantive content (not template-only)
- [ ] \`proposal.md\` states the goal in one sentence
- [ ] \`design.md\` describes the shape of the change
- [ ] \`contract.md\` has TS-flavored pseudocode AND a \`\`\`yaml tests block
- [ ] \`alignment.md\` records sign-off (where required by methodology)
- [ ] \`tasks.md\` covers non-test work (docs, migrations, deploy)

## Verification

- [ ] \`devspec check\` passes locally
- [ ] \`devspec coherence <slug>\` reports zero blocking drift

## What changed

<!-- Brief summary. The contract.md is the source of truth — don't repeat it. -->

---

<sub>Generated PR template — run \`devspec ci init --force\` to refresh. Configure the pipeline axis for full security/quality/test enforcement.</sub>
`;
