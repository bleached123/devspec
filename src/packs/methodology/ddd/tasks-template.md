# Tasks — {{title}}

This file is for work that is **not** a contract test. Test-driven implementation is handled by the contract: run `devspec scaffold <slug>` and work through the failing tests.

Use this file for:

- Documentation and runbook updates
- Database migrations and deployment scripts
- Manual configuration (feature flags, secrets, infra)
- Communication to other teams
- Anything you want a checkbox for that doesn't live in code

If you find yourself wanting to add `- [ ] Implement BookingService.create`, that's a contract test — put it in `contract.md` instead.

## Documentation

- [ ] Update API docs / OpenAPI spec if the contract changed the public surface
- [ ] Update architectural decision records if patterns changed

## Operations

- [ ] Database migration scripts (if persistence changed)
- [ ] Deployment notes / runbook updates
- [ ] Feature flag or secrets configuration

## Coordination

- [ ] Notify dependent teams of breaking changes
- [ ] Schedule alignment review (if not already done)

## Cross-cutting

- [ ] Update `standards.md` if conventions changed
- [ ] Update `tech-stack.yaml` if a new dependency was introduced
- [ ] `devspec check` is clean
- [ ] `devspec coherence <slug>` is clean
