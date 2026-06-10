## React conventions

- **React 19+** is the default. Avoid class components in new code (function components + hooks only).
- **Strict mode on**: wrap the app in `<React.StrictMode>` in development. Double-render in dev catches effect-cleanup bugs early.
- **TypeScript strict mode**: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` in tsconfig.
- **Warnings as errors**: `eslint . --max-warnings 0` in CI. `tsc --noEmit` fails on type errors. `eslint-disable` comments need a `// reason:` justification + issue link.
- **Vite 6+** as the build tool — fast HMR, native ESM, smaller config than webpack/CRA. CRA is deprecated; don't start new projects on it.
- File layout: `src/components/<Feature>/<Component>.tsx`, co-locate `<Component>.test.tsx` and `<Component>.module.css` (or Tailwind classes inline).

## Modern React 19 idioms

- **Server Components (RSC)** when running on a framework that supports them (Next.js 15+, Remix 3 / React Router v7). For pure SPAs on Vite, stick to client components.
- **`use` hook** for awaiting promises in components (replaces some `useEffect` + fetch patterns):
  ```tsx
  function Booking({ promise }: { promise: Promise<Data> }) {
    const data = use(promise);
    return <div>{data.title}</div>;
  }
  ```
- **Actions + `useActionState`** for form submission patterns (replaces ad-hoc loading-state hooks).
- **`useOptimistic`** for optimistic UI updates without manual rollback bookkeeping.
- **`forwardRef` is no longer needed** in React 19 — `ref` is a regular prop for function components.
- **`useTransition` / `useDeferredValue`** for non-urgent updates that shouldn't block input.

## Components

- One component per file. File name matches the export (`BookingCard.tsx` exports `BookingCard`).
- Props typed via `interface BookingCardProps` (or `type` for unions). No `React.FC` — typed props alone are clearer.
- Keep components ≤ 200 lines. If larger, extract sub-components or move logic into custom hooks.
- Custom hooks live in `src/hooks/` and start with `use`. They return objects, not arrays, when there are > 2 values.

## State

- **Client-only UI state** → `useState` / `useReducer` for local, **Zustand** for cross-component shared state.
- **Server state** (data from APIs) → **TanStack Query** (formerly React Query). Don't conflate with client state.
- **URL state** (filters, current page) → router params, not component state. Bookmarkable + shareable.
- Avoid `useEffect` for derived state — compute it during render instead.

## Forms

- **React Hook Form** + **zod** resolver for typed validation.
- Don't roll your own — controlled-component validation has a lot of edge cases (focus, blur, async).

## Data fetching

- **TanStack Query** for cache, refetch, mutations, optimistic updates.
- Define query keys hierarchically (`["bookings", { userId }]`) so invalidation can target subsets.
- Mutations go through `useMutation` with `onSuccess` invalidating the affected queries.

## Routing

- **React Router v7** (formerly Remix) for client + server routing. Or **TanStack Router** for type-safe routes when not using Remix.
- Lazy-load route components with `lazy()` + `<Suspense>` to keep the initial bundle small.

## Styling

- **Tailwind CSS** is the default — utility classes co-located with markup.
- For component-level CSS: CSS Modules (`Component.module.css`). Avoid global styles outside `src/index.css`.
- `clsx` or `cva` for conditional class composition.

## Testing

- **Vitest** + **React Testing Library** for unit/component tests.
- Test behaviour, not implementation. Query by accessible role (`getByRole`), not by class name or test-id when possible.
- One test file per component (`<Component>.test.tsx`).
- E2E with **Playwright** — covers the golden path per route. Test names mirror the contract's tests.

## Accessibility

- All interactive elements reachable + activatable by keyboard.
- Form inputs have associated `<label>`.
- ESLint plugin `jsx-a11y` enabled with `recommended` ruleset.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards frontend/react`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Build | **Vite** (in tech-stack) | Turbopack / Rspack | Vite is the standard; Turbopack via Next.js, Rspack for monorepos |
| Routing | **React Router v7** | TanStack Router | React Router v7 (formerly Remix) — server + client; TanStack Router for type-safe SPA-only |
| Client state | **Zustand** | Jotai | Zustand for store-per-domain; Jotai for atom-based composition |
| Server state | **TanStack Query** | SWR | TanStack Query has the deeper feature set; SWR is lighter |
| Forms | **React Hook Form** + **zod** | Formik | RHF is uncontrolled + faster; zod for shared schema with the backend |
| Schema validation | **zod** | valibot | shared schemas across client + server when both are TS |
| Component primitives | **Radix UI** + **shadcn/ui** | Headless UI | Radix is unstyled + accessible; shadcn/ui is the Radix-based component layer everyone copies |
| Styling | **Tailwind CSS** (in tech-stack) | vanilla-extract | Tailwind for utility-first; vanilla-extract for typed CSS-in-JS without runtime cost |
| Class composition | **clsx** + **cva** | tailwind-merge | clsx for conditional classes, cva for variant-based components |
| Icons | **Lucide React** | iconify | tree-shakeable SVG icons; Lucide has React-native bindings |
| Date / time | **date-fns** | dayjs | date-fns has better TS types; both are small |
| Animation | **Framer Motion** (motion/react) | react-spring | Motion for declarative animation; spring for physics-based |
| Component testing | **React Testing Library** + Vitest | — | covered by tech-stack |
| E2E testing | **Playwright** (in tech-stack) | Cypress | Playwright for newer codebases; Cypress is fine but slower per spec |
| Auth (if needed) | **Clerk** or **Auth.js** | Supabase Auth | Clerk for hosted; Auth.js for self-hosted + framework-agnostic |

All picks are MIT/Apache-licensed and free at typical usage. Paid tiers (Clerk, Supabase) require explicit user escalation per the Philosophy section of `common/standards.md`.

## What to avoid

- Class components in new code — function components + hooks only.
- `useEffect` for derived state — compute during render.
- `useEffect` to call `useState` setters synchronously — that's an infinite loop waiting to happen.
- `React.FC` — type props directly with `interface` or `type`.
- `forwardRef` in React 19 — `ref` is now a regular prop.
- Direct `fetch` in components — go through TanStack Query or a router loader.
- Inline anonymous functions as props on hot lists — `useCallback` if it matters; profile first.
- `any` without a `// reason:` comment.
