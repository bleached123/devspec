import { describe, it, expect } from "vitest";
import { apiMethodImplementedRule } from "../../src/core/coherence/rules/api-method-implemented.js";
import { buildChangeState } from "./helpers.js";

const CONTRACT_WITH_API = `# Contract

\`\`\`ts
interface BookingService {
  create(req: CreateRequest): Booking;
  cancel(id: BookingId): void;
}
\`\`\`
`;

describe("api-method-implemented", () => {
  it("ignores when source index is empty", async () => {
    const state = buildChangeState({ docs: { contract: CONTRACT_WITH_API } });
    expect(await apiMethodImplementedRule.check(state)).toHaveLength(0);
  });

  it("warns when an API method has no source identifier", async () => {
    const state = buildChangeState({
      backend: "rust",
      docs: { contract: CONTRACT_WITH_API },
      sources: [{ name: "create" }],
    });
    const drifts = await apiMethodImplementedRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].message).toContain("1 API method");
  });

  it("passes when all API methods are present in source", async () => {
    const state = buildChangeState({
      backend: "rust",
      docs: { contract: CONTRACT_WITH_API },
      sources: [{ name: "create" }, { name: "cancel" }],
    });
    expect(await apiMethodImplementedRule.check(state)).toHaveLength(0);
  });

  it("finds dotnet methods via PascalCase projection", async () => {
    const state = buildChangeState({
      backend: "dotnet",
      docs: { contract: CONTRACT_WITH_API },
      sources: [{ name: "Create" }, { name: "Cancel" }],
    });
    expect(await apiMethodImplementedRule.check(state)).toHaveLength(0);
  });
});
