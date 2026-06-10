import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import {
  parseCapabilitySpec,
  parseDeltaFile,
  capabilitySpecPath,
  deltaSpecPath,
} from "../../src/core/capability.js";
import { applyMerge, syncChange, validateMerge } from "../../src/core/sync.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "devspec-sync-"));
}

const STARTER_SPEC = `# user-auth

Session management and authentication.

## Requirements

### Requirement: Session storage

Tokens stored in HTTP-only cookies, expiring after 30 minutes.

### Requirement: Password reset

A 15-minute signed JWT is emailed on request.
`;

describe("validateMerge", () => {
  it("returns ok when delta is empty", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile("", "user-auth");
    expect(validateMerge(spec, delta)).toEqual({ ok: true });
  });

  it("returns error when MODIFIED target is missing", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## MODIFIED Requirements

### Requirement: Phantom

New body.
`,
      "user-auth"
    );
    const result = validateMerge(spec, delta);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe("missing-modified");
    expect(result.errors[0].requirement).toBe("Phantom");
  });

  it("returns error when REMOVED target is missing", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## REMOVED Requirements

### Requirement: Ghost

Rationale.
`,
      "user-auth"
    );
    const result = validateMerge(spec, delta);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors[0].kind).toBe("missing-removed");
  });

  it("returns error when ADDED collides with existing", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## ADDED Requirements

### Requirement: Session storage

Conflicting body.
`,
      "user-auth"
    );
    const result = validateMerge(spec, delta);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors[0].kind).toBe("duplicate-added");
  });

  it("aggregates multiple errors in one report", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## ADDED Requirements

### Requirement: Session storage

Body.

## MODIFIED Requirements

### Requirement: Phantom

Body.

## REMOVED Requirements

### Requirement: Ghost

Body.
`,
      "user-auth"
    );
    const result = validateMerge(spec, delta);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors).toHaveLength(3);
  });
});

describe("applyMerge", () => {
  it("appends ADDED requirements to the Requirements section", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## ADDED Requirements

### Requirement: Hardware key support

WebAuthn is supported.
`,
      "user-auth"
    );
    const result = applyMerge(spec, delta);
    expect(result).toContain("### Requirement: Session storage");
    expect(result).toContain("### Requirement: Password reset");
    expect(result).toContain("### Requirement: Hardware key support");
    // ADDED is the last requirement
    const idxAdded = result.indexOf("### Requirement: Hardware key support");
    const idxOriginal = result.indexOf("### Requirement: Password reset");
    expect(idxAdded).toBeGreaterThan(idxOriginal);
  });

  it("replaces body of MODIFIED requirements", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## MODIFIED Requirements

### Requirement: Session storage

NEW body: cookies expire after 30 minutes OR 24 hours total.
`,
      "user-auth"
    );
    const result = applyMerge(spec, delta);
    expect(result).toContain("NEW body: cookies expire");
    expect(result).not.toContain("Tokens stored in HTTP-only cookies, expiring after 30 minutes.");
  });

  it("deletes REMOVED requirements", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile(
      `## REMOVED Requirements

### Requirement: Password reset

Replaced by SSO.
`,
      "user-auth"
    );
    const result = applyMerge(spec, delta);
    expect(result).toContain("### Requirement: Session storage");
    expect(result).not.toContain("### Requirement: Password reset");
    expect(result).not.toContain("15-minute signed JWT");
  });

  it("preserves preamble before Requirements section", () => {
    const spec = parseCapabilitySpec(STARTER_SPEC, "user-auth");
    const delta = parseDeltaFile("## ADDED Requirements\n\n### Requirement: X\n\nBody.\n", "user-auth");
    const result = applyMerge(spec, delta);
    expect(result.startsWith("# user-auth\n\nSession management and authentication.\n")).toBe(true);
  });
});

describe("syncChange", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
    // Workspace marker so any future require* helpers don't trip
    await fs.ensureDir(path.join(root, ".devspec"));
  });

  async function writeCapability(name: string, content: string): Promise<void> {
    await fs.ensureDir(path.dirname(capabilitySpecPath(root, name)));
    await fs.writeFile(capabilitySpecPath(root, name), content);
  }

  async function writeDelta(slug: string, name: string, content: string): Promise<void> {
    await fs.ensureDir(path.dirname(deltaSpecPath(root, slug, name)));
    await fs.writeFile(deltaSpecPath(root, slug, name), content);
  }

  it("syncs an ADDED requirement and renames delta to .synced", async () => {
    await writeCapability("user-auth", STARTER_SPEC);
    await writeDelta(
      "cancel-booking",
      "user-auth",
      `## ADDED Requirements

### Requirement: Hardware key

WebAuthn.
`
    );

    const result = await syncChange(root, "cancel-booking");
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("synced");

    const main = await fs.readFile(capabilitySpecPath(root, "user-auth"), "utf8");
    expect(main).toContain("### Requirement: Hardware key");

    // delta file renamed
    expect(await fs.pathExists(deltaSpecPath(root, "cancel-booking", "user-auth"))).toBe(false);
    expect(
      await fs.pathExists(`${deltaSpecPath(root, "cancel-booking", "user-auth")}.synced`)
    ).toBe(true);
  });

  it("dry-run does not modify files or rename deltas", async () => {
    await writeCapability("user-auth", STARTER_SPEC);
    await writeDelta(
      "cancel-booking",
      "user-auth",
      "## ADDED Requirements\n\n### Requirement: X\n\nBody.\n"
    );

    const result = await syncChange(root, "cancel-booking", { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe("validated");
    expect(result.results[0].preview).toContain("### Requirement: X");

    const main = await fs.readFile(capabilitySpecPath(root, "user-auth"), "utf8");
    expect(main).not.toContain("### Requirement: X");
    expect(await fs.pathExists(deltaSpecPath(root, "cancel-booking", "user-auth"))).toBe(true);
  });

  it("validation failure leaves files untouched", async () => {
    await writeCapability("user-auth", STARTER_SPEC);
    const before = await fs.readFile(capabilitySpecPath(root, "user-auth"), "utf8");
    await writeDelta(
      "cancel-booking",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Phantom\n\nBody.\n"
    );

    const result = await syncChange(root, "cancel-booking");
    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe("error");

    const after = await fs.readFile(capabilitySpecPath(root, "user-auth"), "utf8");
    expect(after).toBe(before);
    expect(await fs.pathExists(deltaSpecPath(root, "cancel-booking", "user-auth"))).toBe(true);
  });

  it("processes multiple capabilities independently", async () => {
    await writeCapability("user-auth", STARTER_SPEC);
    await writeCapability("billing", "# billing\n\n## Requirements\n");
    await writeDelta(
      "cancel-booking",
      "user-auth",
      "## ADDED Requirements\n\n### Requirement: New\n\nBody.\n"
    );
    await writeDelta(
      "cancel-booking",
      "billing",
      "## ADDED Requirements\n\n### Requirement: Refund flow\n\nBody.\n"
    );

    const result = await syncChange(root, "cancel-booking");
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.status === "synced")).toBe(true);
  });

  it("one capability failing does not block other capabilities", async () => {
    await writeCapability("user-auth", STARTER_SPEC);
    await writeCapability("billing", "# billing\n\n## Requirements\n");
    // user-auth delta is invalid (MODIFIED missing target)
    await writeDelta(
      "cancel-booking",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Phantom\n\nBody.\n"
    );
    // billing delta is valid
    await writeDelta(
      "cancel-booking",
      "billing",
      "## ADDED Requirements\n\n### Requirement: Refund\n\nBody.\n"
    );

    const result = await syncChange(root, "cancel-booking");
    expect(result.ok).toBe(false);
    const userAuth = result.results.find((r) => r.capability === "user-auth")!;
    const billing = result.results.find((r) => r.capability === "billing")!;
    expect(userAuth.status).toBe("error");
    expect(billing.status).toBe("synced");
  });

  it("filters by capability when --capability is set", async () => {
    await writeCapability("user-auth", STARTER_SPEC);
    await writeCapability("billing", "# billing\n\n## Requirements\n");
    await writeDelta(
      "cancel-booking",
      "user-auth",
      "## ADDED Requirements\n\n### Requirement: A\n\nBody.\n"
    );
    await writeDelta(
      "cancel-booking",
      "billing",
      "## ADDED Requirements\n\n### Requirement: B\n\nBody.\n"
    );

    const result = await syncChange(root, "cancel-booking", { capability: "billing" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].capability).toBe("billing");
    expect(await fs.pathExists(deltaSpecPath(root, "cancel-booking", "user-auth"))).toBe(true);
  });

  it("reports error when capability has no main spec", async () => {
    await writeDelta(
      "cancel-booking",
      "user-auth",
      "## ADDED Requirements\n\n### Requirement: X\n\nBody.\n"
    );

    const result = await syncChange(root, "cancel-booking");
    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe("error");
    expect(result.results[0].errors![0].kind).toBe("missing-capability");
  });
});
