## Svelte / SvelteKit conventions

- **Svelte 5** with runes mode is the default. Avoid legacy reactive syntax (`$:`, `export let`) in new code.
- **Warnings as errors**: `svelte-check --threshold warning` in CI so any svelte-check warning blocks the build. Pair with `eslint . --max-warnings 0` and `tsc --noEmit`. `<!-- svelte-ignore -->` requires a comment with rationale and an issue link.
- Use SvelteKit conventions for routing (`src/routes/`), server endpoints (`+server.ts`), and load functions (`+page.ts`/`+page.server.ts`).
- Co-locate component, styles, and tests: `Booking.svelte`, `Booking.test.ts` in the same folder.
- Component names are `PascalCase.svelte`. Filenames match the exported component.

## Runes (Svelte 5)

- **`$state`** for reactive local state. Use `$state.raw` for deep objects where reactivity at the leaves is unnecessary.
- **`$derived`** for computed values. Prefer `$derived(...)` over `$derived.by(() => ...)` unless the expression is multi-statement.
- **`$effect`** ONLY for side effects (DOM, network). Don't use it to derive state — use `$derived`.
- **`$props`** for component inputs with destructuring + types:
  ```svelte
  let { title, count = 0 }: { title: string; count?: number } = $props();
  ```
- **`$bindable`** sparingly — only when two-way binding is genuinely needed.

## Snippets (replaces named slots)

- Use **snippets** (`{#snippet}` / `{@render}`) instead of named slots in new code:
  ```svelte
  {#snippet item(booking)}
    <li>{booking.title}</li>
  {/snippet}
  <List items={bookings} {item} />
  ```
- Children are passed via `{@render children?.()}` from the parent.

## Attachments (Svelte 5.29+)

- Use **attachments** (`{@attach ...}`) for DOM-level behaviour instead of custom actions where possible — they're typed, composable, and live in the markup.

## Component shape

- Smart vs presentational split: routes/load functions hold data; components render. Keep components ≤ 150 lines.
- Side effects in `$effect`, not module-level code.
- Avoid `bind:` across component boundaries unless `$bindable` makes the intent explicit.

## Data fetching

- Server-side via `+page.server.ts` `load` for SSR + initial state.
- Client-side via `fetch` from `$lib/api/`. Don't scatter fetch calls inside components.
- Treat the SvelteKit `load` function as the integration point with the backend contract.
- Use **form actions** (`+page.server.ts` `actions`) for mutations — they progressively enhance to JS-free forms.

## Testing

- Component tests: Vitest + `@testing-library/svelte`. One file per component.
- E2E: Playwright runs against the dev server. Cover the golden path per route.
- Use the contract's test names as Playwright `test.describe` headings to keep spec ↔ test traceability.

## Accessibility

- All interactive elements have visible focus state.
- Form inputs have `<label>` associations.
- Run `npm run lint -- --warn-on-a11y` before merging.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards frontend/svelte`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Build | **Vite** (via SvelteKit) | — | SvelteKit ships Vite; don't fight it |
| State (cross-component) | **runes** (`$state` exported from `.svelte.ts`) | nanostores | use stores only when state must persist outside the component tree |
| Forms | **SvelteKit form actions** + zod | felte, superforms | form actions progressively enhance; superforms layers nice UX |
| Schema validation | **zod** | valibot | shared with the backend if it's Node/TS |
| Data fetching (client) | SvelteKit `fetch` from `load` | tanstack-query | tanstack-query when caching + revalidation become non-trivial |
| Styling | **Tailwind CSS** (in tech-stack) | open-props, vanilla CSS | Tailwind for utility-first; vanilla CSS via co-located `.svelte` `<style>` for simple cases |
| Component primitives | **Bits UI** or **Melt UI** | manual | unstyled, accessible primitives — pair with Tailwind |
| Icons | **Lucide** | iconify | tree-shakeable SVG icons |
| Date / time | **date-fns** | dayjs | both small; date-fns has better TS types |
| E2E testing | **Playwright** (in tech-stack) | — | works against the dev server |

All free + MIT/Apache-licensed.

## What to avoid

- `export let foo` props — use `$props()`.
- `$:` reactive statements — use `$derived` or `$effect` as appropriate.
- `import { writable } from "svelte/store"` for component-local state — use `$state`.
- Named slots — use snippets.
- Custom actions for new DOM behaviour — use attachments.
