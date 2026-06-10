# Design — {{title}}

## Feature file
The Gherkin feature file location: `features/<area>/<feature>.feature`.

## Step definitions layout
Where the binding code lives (e.g. `features/steps/`, or framework-specific).

## Outside-in flow
The order of failing tests, from outermost (scenario) to innermost (unit):

1. **Scenario fails** at step "X"
2. **Application service fails** because Y is missing
3. **Domain logic fails** because Z is not implemented
4. ...

## Trade-offs
Alternatives considered.
