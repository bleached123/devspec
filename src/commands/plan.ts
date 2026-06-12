import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { readDevspecConfig } from "../core/config.js";
import { fragmentPath, kebabCase, renderTemplate } from "../core/templates.js";
import { LIFECYCLE_STAGES, type Stage } from "../core/coherence/types.js";
import { cmd, nextStep } from "../core/hints.js";

const FALLBACK_TEMPLATES: Record<Stage, string> = {
  discovery: `# Discovery — {{title}}\n\n## Problem\n## Evidence\n## Constraints\n## Open questions\n`,
  proposal: `# Proposal — {{title}}\n\n## Goal\n## Approach\n## Non-goals\n## Risks\n`,
  design: `# Design — {{title}}\n\n## What changes\n## How it works\n## Trade-offs\n`,
  contract: `<!--\n  Optional frontmatter — list the capability spec(s) this change deltas.\n  Each capability listed here MUST have a matching deltas/<capability>/spec.md\n  file in this change directory. Use \`devspec specs init <capability>\` to\n  create a capability before referencing it.\n\n  Leave the frontmatter out entirely if this change does not modify any\n  capability spec (legacy / leaf changes are fine without it).\n\n  ---\n  capability:\n    - user-auth\n  ---\n-->\n\n# Contract — {{title}}\n\n## API (TS-flavored pseudocode)\n\n\`\`\`ts\n// interfaces, types, error variants\n\`\`\`\n\n## Reference algorithm (optional)\n\n\`\`\`ts\n// happy-path walkthrough\n\`\`\`\n\n## Tests\n\n\`\`\`yaml tests\n- name: <kebab or prose>\n  given: []\n  when: <action>\n  then: <expected outcome>\n\`\`\`\n`,
  alignment: `# Alignment — {{title}}\n\n## Reviewers\n## Decisions captured\n## Open disagreements\n`,
  tasks: `# Tasks — {{title}}\n\n- [ ] Implement\n- [ ] Test\n`,
};

export const planCommand = new Command("plan")
  .description("Create a new lifecycle change directory")
  .argument("<title>", "Title of the change (will be kebab-cased)")
  .option("--name <slug>", "Override the kebab-cased slug")
  .option("--json", "Emit the created change as JSON (for tooling)", false)
  .action(async (title: string, options: { name?: string; json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const config = await readDevspecConfig(root);
    const slug = options.name ? kebabCase(options.name) : kebabCase(title);

    const fail = (message: string) => {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: message }));
      } else {
        console.error(chalk.red(message));
      }
      process.exitCode = 1;
    };

    if (!slug) {
      fail("Could not derive a slug from the title.");
      return;
    }

    const projectDir = devspecPath(root, "projects", slug);
    if (await fs.pathExists(projectDir)) {
      fail(`Change "${slug}" already exists at ${projectDir}.`);
      return;
    }

    await fs.ensureDir(projectDir);

    for (const stage of LIFECYCLE_STAGES) {
      const methodologyTemplate = fragmentPath(
        "methodology",
        config.methodology,
        `${stage}-template.md`
      );
      const source = (await fs.pathExists(methodologyTemplate))
        ? await fs.readFile(methodologyTemplate, "utf8")
        : FALLBACK_TEMPLATES[stage];
      const rendered = renderTemplate(source, { title, slug });
      await fs.writeFile(path.join(projectDir, `${stage}.md`), rendered);
    }

    const status = {
      slug,
      title,
      created: new Date().toISOString(),
      stages: Object.fromEntries(
        LIFECYCLE_STAGES.map((stage) => [stage, "pending"])
      ),
      archived: false,
    };
    await fs.writeFile(
      path.join(projectDir, "status.yaml"),
      YAML.stringify(status)
    );

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            slug,
            title,
            dir: path.relative(root, projectDir),
            methodology: config.methodology,
            stages: Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, "pending"])),
            docs: LIFECYCLE_STAGES.map((s) => `${s}.md`),
          },
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.green(`Created change "${slug}".`));
    console.log(`  methodology: ${config.methodology}`);
    console.log(`  location:    ${path.relative(root, projectDir)}`);
    console.log("  stages:");
    for (const stage of LIFECYCLE_STAGES) {
      console.log(`    ${chalk.cyan(stage)} → ${stage}.md`);
    }
    console.log("");
    nextStep(
      `fill in ${path.relative(root, projectDir)}/discovery.md, then ${cmd(`devspec advance ${slug} discovery`)}`
    );
  });
