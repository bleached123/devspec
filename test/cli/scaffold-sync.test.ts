import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

const CONTRACT_WITH_TESTS = `# Contract

## API
\`\`\`ts
interface BookingService {
  create(req: CreateRequest): Booking;
  cancel(id: BookingId): void;
}
\`\`\`

## Tests
\`\`\`yaml tests
- name: creates a booking
  given: []
  when: create called
  then: returns booking
- name: cancels a booking
  given: []
  when: cancel called
  then: ok
\`\`\`
`;

describe("devspec scaffold", () => {
  it(
    "writes Rust test stubs to a default path",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await fs.writeFile(
          path.join(root, ".devspec", "projects", "add-bookings", "contract.md"),
          CONTRACT_WITH_TESTS
        );
        const r = await runCli(["scaffold", "add-bookings"], root);
        expect(r.exitCode).toBe(0);
        const written = await fs.readFile(
          path.join(root, "tests", "add_bookings_tests.rs"),
          "utf8"
        );
        expect(written).toContain("#[test]");
        expect(written).toContain("fn creates_a_booking");
        expect(written).toContain("fn cancels_a_booking");
        expect(written).toContain("todo!");
      });
    }
  );

  it(
    "emits to stdout when --stdout is passed",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await fs.writeFile(
          path.join(root, ".devspec", "projects", "add-bookings", "contract.md"),
          CONTRACT_WITH_TESTS
        );
        const r = await runCli(["scaffold", "add-bookings", "--stdout"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("#[test]");
      });
    }
  );

  it(
    "writes Dotnet test stubs with --write",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "dotnet",
          plan: ["Add bookings"],
        });
        await fs.writeFile(
          path.join(root, ".devspec", "projects", "add-bookings", "contract.md"),
          CONTRACT_WITH_TESTS
        );
        const r = await runCli(
          ["scaffold", "add-bookings", "--write", "tests/Bookings.cs"],
          root
        );
        expect(r.exitCode).toBe(0);
        const written = await fs.readFile(
          path.join(root, "tests", "Bookings.cs"),
          "utf8"
        );
        expect(written).toContain("[Fact]");
        expect(written).toContain("CreatesABooking");
        expect(written).toContain("CancelsABooking");
        expect(written).toContain("NotImplementedException");
      });
    }
  );

  it(
    "fails when contract has no tests block",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await fs.writeFile(
          path.join(root, ".devspec", "projects", "add-bookings", "contract.md"),
          "# Contract\n\n## API\n```ts\ninterface X {}\n```\n"
        );
        const r = await runCli(["scaffold", "add-bookings"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/No tests found/);
      });
    }
  );
});

describe("devspec sync-contract", () => {
  it(
    "proposes a rename when source uses a different name",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await fs.writeFile(
          path.join(root, ".devspec", "projects", "add-bookings", "contract.md"),
          CONTRACT_WITH_TESTS
        );
        await fs.ensureDir(path.join(root, "src"));
        await fs.writeFile(
          path.join(root, "src", "bookings.rs"),
          "pub fn create_booking() {}\npub fn cancel_pending() {}\n"
        );

        const dry = await runCli(["sync-contract", "add-bookings"], root);
        expect(dry.exitCode).toBe(0);
        expect(dry.stdout).toContain("BookingService.create");
        expect(dry.stdout).toContain("create_booking");
        expect(dry.stdout).toContain("createBooking");
      });
    }
  );

  it(
    "applies rename when --apply is set and confidence is high",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const contractPath = path.join(
          root,
          ".devspec",
          "projects",
          "add-bookings",
          "contract.md"
        );
        await fs.writeFile(contractPath, CONTRACT_WITH_TESTS);
        await fs.ensureDir(path.join(root, "src"));
        await fs.writeFile(
          path.join(root, "src", "bookings.rs"),
          "pub fn create_booking() {}\npub fn cancel_pending() {}\n"
        );

        const apply = await runCli(
          ["sync-contract", "add-bookings", "--apply"],
          root
        );
        expect(apply.exitCode).toBe(0);

        const updated = await fs.readFile(contractPath, "utf8");
        expect(updated).toContain("createBooking(");
        expect(updated).toContain("cancelPending(");
        expect(updated).not.toMatch(/\bcreate\(/);
        expect(updated).not.toMatch(/\bcancel\(/);
      });
    }
  );
});
