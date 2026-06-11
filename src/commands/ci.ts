import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { readDevspecConfig, readTechStack } from "../core/config.js";
import { fragmentPath } from "../core/templates.js";
import { nextStep } from "../core/hints.js";

type PlatformPaths = {
  workflowRel: string;
  releaseRel: string;
  prTemplateRel: string;
  setupHint: string;
};

const PLATFORM_PATHS: Record<string, PlatformPaths> = {
  github: {
    workflowRel: ".github/workflows/ci.yml",
    releaseRel: ".github/workflows/release.yml",
    prTemplateRel: ".github/pull_request_template.md",
    setupHint:
      "commit + push, enable required status checks (security, quality, test-unit, test-integration, test-e2e, devspec) in GitHub branch protection, then create the 'staging' and 'production' Environments under repo Settings (production with required reviewers)",
  },
  azuredevops: {
    workflowRel: "azure-pipelines.yml",
    releaseRel: "azure-pipelines-release.yml",
    prTemplateRel: ".azuredevops/pull_request_template.md",
    setupHint:
      "commit + push, create the 'ci' and 'release' pipelines pointing at azure-pipelines.yml / azure-pipelines-release.yml, add a Build Validation branch policy on main requiring 'ci' (plus min reviewers + linked work items), then create the 'staging' and 'production' Environments under Pipelines → Environments (production with required approvers)",
  },
};

export const ciCommand = new Command("ci").description(
  "Generate continuous-integration scaffolding for DevSpec checks"
);

ciCommand
  .command("init")
  .description(
    "Write the CI pipeline + a PR template that wires DevSpec checks into your platform (GitHub Actions or Azure Pipelines)"
  )
  .option("--force", "Overwrite existing files", false)
  .option(
    "--platform <name>",
    "CI platform: github | azuredevops (defaults to workspace pipeline fragment, falls back to `github`)"
  )
  .action(async (options: { force: boolean; platform?: string }) => {
    const root = await requireWorkspaceRoot();
    const config = await readDevspecConfig(root);

    const platform = options.platform ?? config.pipeline ?? "github";
    const platformPaths = PLATFORM_PATHS[platform];

    if (!platformPaths) {
      console.error(
        chalk.red(
          `Unsupported pipeline platform "${platform}". Supported: ${Object.keys(PLATFORM_PATHS).join(", ")}. Add a fragment at src/packs/pipeline/<name>/ (plus a PLATFORM_PATHS entry in src/commands/ci.ts) to extend.`
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

    const toAbs = (rel: string) => path.join(root, ...rel.split("/"));

    const targets: { rel: string; abs: string; content: string }[] = [
      {
        rel: platformPaths.workflowRel,
        abs: toAbs(platformPaths.workflowRel),
        content: workflow,
      },
      {
        rel: platformPaths.prTemplateRel,
        abs: toAbs(platformPaths.prTemplateRel),
        content: prTemplate,
      },
    ];

    if (releaseWorkflow) {
      targets.push({
        rel: platformPaths.releaseRel,
        abs: toAbs(platformPaths.releaseRel),
        content: releaseWorkflow,
      });
    }

    // Backward-compat: previously ci init wrote devspec.yml. If that file
    // exists, leave it alone but flag it so the user can delete it after
    // verifying ci.yml works.
    const legacyWorkflow = path.join(root, ".github", "workflows", "devspec.yml");
    const hasLegacy = platform === "github" && (await fs.pathExists(legacyWorkflow));

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
      console.log(chalk.dim("The install step defaults to `npm install -g devspec-cli` (the published package)."));
      console.log(chalk.dim("Pin a version or switch to a git/source install in the workflow if you need to."));
      console.log(chalk.dim(`The deploy_cmd entries in ${releaseConfigRel} still need to be filled in`));
      console.log(chalk.dim("for your deploy target before release deploys will do anything."));
      console.log("");
      nextStep(platformPaths.setupHint);
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
    if (platform !== "github") {
      throw new Error(
        `Pipeline fragment "pipeline/${platform}" is missing its templates (expected ${fragWorkflow}). Reinstall devspec or add the fragment files.`
      );
    }
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
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (full, expr, offset: number) => {
    const dotted = String(expr).trim();
    const resolved = resolveDotPath(vars, dotted);
    if (resolved === undefined) return full;
    if (typeof resolved === "boolean") return resolved ? "true" : "false";
    let text = String(resolved);
    // Multi-line values (e.g. release.yaml deploy_cmd blocks) must inherit the
    // placeholder's indentation, or continuation lines land at column 0 and
    // break the surrounding YAML.
    if (text.includes("\n")) {
      const lineStart = template.lastIndexOf("\n", offset - 1) + 1;
      const indent = /^[ \t]*/.exec(template.slice(lineStart, offset))?.[0] ?? "";
      text = text
        .replace(/\r?\n$/, "")
        .split("\n")
        .map((line, i) => (i === 0 ? line : indent + line))
        .join("\n");
    }
    return text;
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
        run: npm install -g devspec-cli

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
