## Vue conventions

- **Vue 3.5+** with the **Composition API** (`<script setup lang="ts">`) is the default. Options API only in code being maintained, not in new code.
- **TypeScript strict mode**: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` in tsconfig.
- **Warnings as errors**: `eslint . --max-warnings 0` in CI. `vue-tsc --noEmit` fails on type errors (replaces `tsc` for `.vue` files). `eslint-disable` requires a `// reason:` comment + issue link.
- **Vite 6+** as the build tool (Vue's official toolchain). `create-vue` scaffolds it for new projects.
- File layout: `src/components/<Feature>/<Component>.vue`, co-locate `<Component>.test.ts` and `<Component>.spec.ts` next to the component.
- Component names: **PascalCase** in code (`<BookingCard />`), **kebab-case** in DOM templates if mixed with HTML (`<booking-card></booking-card>`).

## `<script setup>` (default for new code)

- Use **`<script setup lang="ts">`** for every new component. Auto-imports props/emits/refs, no `setup()` function boilerplate.
- **`defineProps<T>()`** with TypeScript types — compile-time validation:
  ```vue
  <script setup lang="ts">
  interface Props {
    title: string;
    count?: number;
  }
  const { title, count = 0 } = defineProps<Props>();
  </script>
  ```
- **`defineEmits<T>()`** with a typed event map.
- **`defineModel<T>()`** (3.4+) for two-way binding — replaces the `v-model` boilerplate.
- **`defineSlots<T>()`** for typed slots.

## Reactivity

- **`ref()`** for primitive values, **`reactive()`** for objects (or `ref()` for objects too — pick one style per codebase and stick to it).
- **`computed()`** for derived state. Don't recompute inside templates — define a `computed` instead.
- **`watch()`** for reactive side effects with explicit dependencies; **`watchEffect()`** when dependencies are implicit. Prefer `watch` for clarity.
- Don't destructure reactive objects — you lose reactivity. Use `toRefs()` or `storeToRefs()` (Pinia) when needed.

## Component shape

- One component per file. File name matches the component (`BookingCard.vue` → `<BookingCard />`).
- Keep `<template>` ≤ 100 lines and `<script setup>` ≤ 150 lines. Extract sub-components or composables when larger.
- Composables (reusable logic) live in `src/composables/` and start with `use` (`useBookings.ts`).

## State

- **Component-local** → `ref`/`reactive` inside `<script setup>`.
- **Cross-component** → **Pinia** (the official store; Vuex is end-of-life). One store per domain.
- **Server state** → **TanStack Query (Vue)** or **VueUse**'s `useFetch`. Don't conflate with client state.

## Forms

- **VeeValidate** + **zod** resolver for validation. Don't roll your own.
- Use `<FormKit>` (formkit.com) only if you want pre-built input components; otherwise plain inputs + VeeValidate.

## Data fetching

- **TanStack Query** for cache, refetch, mutations.
- Query keys hierarchical (`["bookings", { userId }]`) so invalidation can target subsets.

## Routing

- **Vue Router v4** is the standard.
- Lazy-load route components with dynamic `import()` to keep the initial bundle small.
- Route metadata for auth/role gates (`meta: { requiresAuth: true }`).

## Styling

- **Tailwind CSS** is the default — utility classes in `<template>` directly.
- For scoped component styles: `<style scoped>` blocks. Avoid `:deep()` selectors unless necessary (they're brittle).

## Testing

- **Vitest** + **Vue Test Utils** + **`@testing-library/vue`** for component tests.
- Test behaviour via the public API (props + emits + DOM), not implementation details.
- One test file per component (`<Component>.test.ts`).
- E2E with **Playwright** — covers golden path per route. Test names mirror contract test names.

## Accessibility

- Interactive elements reachable + activatable by keyboard.
- `<label>` associations on form inputs.
- ESLint plugin `vuejs-accessibility` enabled with `recommended` ruleset.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards frontend/vue`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Build | **Vite** (in tech-stack) | — | Vue's official build tool |
| Routing | **Vue Router v4** | unplugin-vue-router | Vue Router is the official; unplugin-vue-router for file-system routing |
| State (cross-component) | **Pinia** | — | Pinia is the official store; Vuex is end-of-life |
| Server state | **TanStack Query (Vue)** | VueUse `useFetch` | TanStack Query has the deeper feature set; VueUse for simpler cases |
| Forms | **VeeValidate** + **zod** | FormKit | VeeValidate + zod for typed schemas; FormKit when you want pre-built input components |
| Schema validation | **zod** | valibot, yup | shared schemas across client + server when both are TS |
| Component primitives | **Radix Vue** | Headless UI Vue | Radix Vue is the Vue port of Radix UI — unstyled + accessible |
| UI component library | **PrimeVue** | Element Plus, Vuetify | PrimeVue is feature-complete + free; Element Plus is popular in zh-CN ecosystem |
| Styling | **Tailwind CSS** (in tech-stack) | UnoCSS | Tailwind for utility-first; UnoCSS for atomic CSS with smaller config surface |
| Icons | **Lucide Vue** | iconify | tree-shakeable SVG icons |
| Date / time | **date-fns** | dayjs | date-fns has better TS types; both are small |
| Utilities | **VueUse** | — | huge collection of useful composables (useFetch, useStorage, useEventListener, etc.) |
| Animation | **`@vueuse/motion`** | GSAP | `@vueuse/motion` for declarative; GSAP for complex sequencing |
| Component testing | **Vue Test Utils** + Vitest | `@testing-library/vue` | Vue Test Utils is official; `@testing-library/vue` for behaviour-focused tests |
| E2E testing | **Playwright** (in tech-stack) | Cypress | Playwright for newer codebases |
| Auth (if needed) | **Auth.js** | Supabase Auth, Clerk | Auth.js for self-hosted + framework-agnostic |

All picks are MIT/Apache-licensed and free at typical usage. Paid tiers (Supabase, Clerk) require explicit user escalation per the Philosophy section of `common/standards.md`.

## What to avoid

- Options API in new code — use `<script setup>` Composition API.
- Vuex — use Pinia.
- `defineComponent()` wrapper boilerplate — `<script setup>` removes the need.
- Destructuring `reactive()` objects — you lose reactivity. Use `toRefs()` or `storeToRefs()`.
- `v-html` with user-controlled content — XSS risk.
- Mutating props in child components — emit an event instead.
- `any` without a `// reason:` comment.
