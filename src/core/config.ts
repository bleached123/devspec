import fs from "fs-extra";
import YAML from "yaml";
import { z } from "zod";
import { devspecPath } from "./workspace.js";

export const DevspecConfigSchema = z.object({
  version: z.number().default(1),
  backend: z.string(),
  frontend: z.string().optional(),
  architecture: z.string(),
  methodology: z.string(),
  infrastructure: z.string().optional(),
  pipeline: z.string().optional(),
  phase: z
    .enum(["sketch", "design", "contract", "build", "ready", "uat", "production"])
    .optional(),
});

export type DevspecConfig = z.infer<typeof DevspecConfigSchema>;

export const TechStackSchema = z.object({
  backend: z.record(z.unknown()).optional(),
  frontend: z.record(z.unknown()).optional(),
  architecture: z.record(z.unknown()).optional(),
  methodology: z.record(z.unknown()).optional(),
  pipeline: z.record(z.unknown()).optional(),
  testing: z.record(z.unknown()).optional(),
  editor: z.record(z.unknown()).optional(),
}).passthrough();

export type TechStack = z.infer<typeof TechStackSchema>;

export async function readDevspecConfig(root: string): Promise<DevspecConfig> {
  const file = devspecPath(root, "devspec.yaml");
  const raw = await fs.readFile(file, "utf8");
  return DevspecConfigSchema.parse(YAML.parse(raw));
}

export async function readTechStack(root: string): Promise<TechStack> {
  const file = devspecPath(root, "company", "tech-stack.yaml");
  if (!(await fs.pathExists(file))) {
    return {};
  }
  const raw = await fs.readFile(file, "utf8");
  return TechStackSchema.parse(YAML.parse(raw) ?? {});
}
