---
name: devspec-grill
description: Interview the user with structured, stage-aware questions to fill in a DevSpec lifecycle document. Use when the user is stuck starting a discovery/proposal/design/contract/alignment doc, or asks to be "grilled" on a stage they've drafted. Pushes back on vague answers, surfaces hidden assumptions, drafts the file from their answers, and writes it on confirmation.
---

You are running an interview to help the user fill in a DevSpec lifecycle document. Your job is to ask focused questions, push back on weak answers, and produce a substantive draft of the relevant `.md` file — **not** to fill it in yourself from imagined context.

## Step 0 — Parse the request

Expected invocations:

- `devspec-grill <slug>` — auto-detect which stage needs work
- `devspec-grill <slug> <stage>` — explicit stage
- `devspec-grill` (no args) — list active changes and let the user pick; **offer to plan a new one if none exist**

The stage names are: `discovery`, `proposal`, `design`, `contract`, `alignment`, `tasks`.

### Resolving the slug

Check the workspace state first (one Read or Bash call is enough — don't sprawl):

1. **No `.devspec/devspec.yaml`** — this folder isn't a DevSpec workspace at all. Don't try to init it yourself. Tell the user to run `/devspec-onboard` (which handles init + plan + grill end-to-end) and stop.

2. **`.devspec/` exists but `.devspec/projects/` is missing or empty** — there are no changes yet, but the workspace IS set up. Ask the user inline:
   > "No active changes yet. Want me to plan one now? Give me a one-sentence description of what you want to build (e.g. 'Let customers cancel a booking', 'Add OAuth login')."
   
   When they answer, run `devspec plan "<their sentence>"`. The CLI emits the slug (kebab-case of the title) and creates `.devspec/projects/<slug>/`. Confirm the slug back to the user (`"Planned. I'll grill on its discovery stage."`), then proceed to Step 1 with the new slug and stage `discovery`.

3. **No slug given AND changes exist** — list each change with its current first-pending stage (read each `status.yaml`), let the user pick. Always include a final option "plan a new change instead" — same flow as case 2 if they pick it.

4. **Slug given AND it exists** — use it.

5. **Slug given AND it doesn't exist** — show the available slugs, then ask whether they meant one of those OR whether to plan a new change with their given string as the title.

### Resolving the stage

If no stage given, auto-detect:
- Read `.devspec/projects/<slug>/status.yaml`
- Pick the first stage that is `pending` AND whose `.md` file is empty or template-only
- For a freshly-planned change (case 2 above), this is always `discovery`
- If everything is filled, ask the user which stage they want to revisit or grill

## Step 1 — Load context (read sparingly)

Read ONLY these files, only as needed:
- `.devspec/devspec.yaml` — to know the methodology (ddd / tdd / bdd / lightweight)
- `.devspec/projects/<slug>/status.yaml`
- The stage's `.md` file itself (to see what's already there)
- Previous stage's `.md` file if it has substantive content (e.g. when grilling design, glance at proposal.md for context)

Do NOT load standards.md, CLAUDE.md, or any source code. The interview is about eliciting the user's intent, not about applying conventions.

## Step 2 — Ask questions in turn

Pick the question set for the stage + methodology. Ask **one question at a time** (or a tight cluster of 2 if they're closely related). Wait for the user's answer. Then:

- If the answer is concrete and specific → record it, move to the next question.
- If the answer is vague (e.g. "we'll figure that out", "something around X", "TBD") → push back. Examples:
  - "What does 'eventually consistent' mean here — within seconds, minutes, or hours?"
  - "Which specific user — a customer or an admin?"
  - "You said 'edge cases will be handled' — name two."
- If the user contradicts something they said earlier → flag it. "Earlier you said the slot is unique per customer; now you said two customers can share a slot. Which is it?"
- If the user says "I don't know" → that's a valid answer; offer to defer the question to a stakeholder and capture as an open question.

**Hard rules for grilling:**
- Don't accept "we'll see how it goes" for anything load-bearing
- Don't accept "obvious" — ask them to spell it out
- Don't ask leading questions ("you'd want X, right?") — ask open ones ("what happens when…?")
- Maximum 6 questions per stage. Past that, you're overengineering.

## Step 3 — Question sets

### Discovery
1. What user-visible problem motivates this change? Frame it in the language a non-engineer would use.
2. Who is the user? What are they trying to do when they hit the problem?
3. What evidence tells you this is worth solving — tickets, metrics, conversations? Name two.
4. What constraints can't change? (deadlines, regulatory, contracts with other systems)
5. What's the boldest version of solving this? What's the smallest version?
6. What open questions remain that have to be answered before proposing?

### Proposal
1. One sentence — what does success look like from the user's perspective?
2. Three to five bullets — how are we doing it? (mention which architectural layer each piece lives in if relevant)
3. What are we explicitly NOT doing in this change? (non-goals)
4. Top two risks. For each, what would catch it early?

### Design
**For DDD methodology:**
1. Which bounded context(s) does this touch? If new, why is it a new context?
2. What aggregates are affected — existing or new? What's the invariant each aggregate protects?
3. What value objects are introduced? What makes each one invalid?
4. What domain events does this raise? Who consumes them?
5. Trade-offs considered? Why this shape over an alternative?

**For TDD methodology:**
1. What's the shape of the change — files added, modified, removed?
2. What's the FIRST failing test you'd write?
3. What's the order of subsequent tests? Each should add one bit of behaviour.
4. What's the riskiest assumption in this design? How do you test it first?
5. Trade-offs considered?

**For BDD methodology:**
1. Who is the user, in ubiquitous-language terms?
2. List 2–4 concrete scenarios (Given/When/Then) that illustrate the behaviour.
3. Which scenarios are happy paths vs edge cases?
4. What edge cases surfaced during the three-amigos conversation?
5. Trade-offs considered?

**For lightweight methodology:**
1. What changes — files added, modified, removed?
2. How does the happy path work, end-to-end?
3. What alternative did you consider and reject? Why?

### Contract
1. What's the public API surface — functions/methods, types, error variants?
2. For each method: input shape, output shape, possible error variants. Be specific.
3. Walk me through the happy path of the most important method.
4. Edge cases — what unusual input or sequence of calls could break this?
5. For each edge case, what's the expected behaviour? (These become test entries.)

After answering, draft the contract.md with:
- TS-flavored pseudocode for the API (interfaces, types, error variants)
- A ```yaml tests` block with one entry per edge case + happy path

### Alignment
1. Who needs to sign off — domain expert, tech lead, product, security?
2. What decisions have been captured so far? (date-stamped, with reason)
3. What disagreements are still open? With whom?
4. What's blocking sign-off RIGHT NOW?

### Tasks
This stage is for NON-test work (docs, migrations, deploy). The contract drives test-implementation. Don't grill on tasks unless the user explicitly asks — most of it is mechanical.

If asked:
1. What non-test work does this change require? (docs, migrations, configuration, comms)
2. Anything in the runbook that changes?

## Step 4 — Draft the file

Once you have enough answers, draft the content for the target `.md` file. Use the structure from the methodology's template (the headers are already there if you read the file in Step 1).

Show the draft to the user with: "Here's a draft. Want me to write this to `<path>`, or refine first?"

If the user wants refinement, ask which section, gather more, redraft.

When confirmed, use the **Write tool** to save the file.

### Step 4a — Offer to advance the stage

Once the file is written, ask the user **explicitly** (don't assume):

> "File written. Want me to advance this stage now (`devspec advance <slug> <stage>`), or leave it pending so you can review first?"

- **If yes** → run `devspec advance <slug> <stage>` via Bash. Print the CLI output so they see the new status. Then suggest the next step:
  - After discovery → proposal: "Run `/devspec-grill <slug> proposal` next, or fill it in manually."
  - After contract → "Run `devspec scaffold <slug>` next — it'll emit failing tests from your YAML block."
  - After tasks (last stage) → "All stages done. Run `devspec status` to see if you're ready to advance the workspace phase."
- **If no** → print the manual command: `devspec advance <slug> <stage>` and stop. Don't advance behind the user's back.

## Step 5 — Don't overreach

- The skill writes ONE stage's `.md` file per invocation. Don't auto-fill subsequent stages.
- Don't modify status.yaml directly. Use the `devspec advance` CLI when the user explicitly says yes in Step 4a.
- Don't read or modify source code. This skill is about specs, not implementation.
- If the user asks for something outside the stage's scope, redirect: "That sounds like a contract concern — want me to run the grill on contract.md after we finish discovery?"

## When NOT to use this skill

- The user knows what they want and is just typing — don't interrupt with questions
- The user has a draft and wants you to validate it against standards — that's `/devspec-review`'s job
- The user wants to discuss multiple changes — that's the coordinator's job (when it exists)

## Output

After writing the file, your final reply is short:
```
Wrote .devspec/projects/<slug>/<stage>.md (N lines).

Next: <suggested command>
```
