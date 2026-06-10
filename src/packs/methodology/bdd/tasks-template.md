# Tasks — {{title}}

This file is for work that is **not** a BDD scenario. Scenarios are handled by the contract: run `devspec scaffold <slug>` and drive each failing scenario outside-in.

Use this file for:

- [ ] Write the `.feature` file with the Gherkin scenarios from the contract
- [ ] Bind step definitions (one per phrase, calling into application services)
- [ ] Update API docs / OpenAPI if the public surface changed
- [ ] Update the domain glossary if new vocabulary was introduced
- [ ] `devspec check` is clean
- [ ] `devspec coherence <slug>` is clean
