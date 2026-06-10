## Blazor conventions

- Target **net10.0** for new projects (current LTS, released November 2025; Blazor "United" model — Server + WebAssembly + Auto in one app).
- **Warnings as errors**: `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` and `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>` in every project's `<PropertyGroup>`. Razor compiler warnings (RZ*, BL*) are included by default — don't exclude them. `<WarningsNotAsErrors>` only for documented, time-boxed exceptions referencing a ticket.
- Default to **Interactive Server** render mode unless there's a documented reason for WebAssembly or Auto. Server has lower payloads, simpler debugging, and shared state with the backend.
- Components are `.razor` files in `Components/` (PascalCase). Co-locate `.razor.css` and `.razor.cs` next to the component.
- Code-behind for components > 50 lines of logic. Inline `@code` blocks are fine for trivial cases.
- Use dependency injection for services (`@inject`), not static state.

## Render modes (.NET 8+ / .NET 9)

- Declare render mode explicitly per component or page:
  - `@rendermode InteractiveServer` — most components
  - `@rendermode InteractiveWebAssembly` — when you need offline / pure client
  - `@rendermode InteractiveAuto` — server-first, then WASM after assets cached
  - `@rendermode @(new InteractiveServerRenderMode(prerender: false))` — when prerender breaks
- Don't mix modes inside a render tree without thinking through state ownership. Pass DTOs across mode boundaries, not entities.
- Prefer **static SSR** (no `@rendermode`) for read-only pages — much smaller payload.

## Component shape

- One component per concern. Keep `.razor` markup ≤ 100 lines; lift complex logic into `.razor.cs`.
- Use `[Parameter]` for inputs, `EventCallback<T>` for outputs.
- Cascading values for cross-cutting concerns (auth state, theme) — sparingly.
- Use `<HeadContent>` and `<PageTitle>` for per-page metadata in SSR mode.

## State and lifecycle

- Avoid singletons holding UI state in Blazor Server. Use scoped services tied to the circuit.
- `OnInitializedAsync` for data fetches. Don't fetch in `OnAfterRender` unless you specifically need the DOM.
- `Dispose` IDisposable services or event handlers attached to outer scopes.
- Persistent state across render modes uses `PersistentComponentState`.

## Data fetching

- Use `HttpClient` injected via DI for external APIs. Backend calls go through application-layer services, not direct DbContext access from components.
- Don't pass `DbContext` into components. Use a Mediator/CQRS handler or an application service.
- Use **streaming rendering** (`@attribute [StreamRendering]`) for pages with slow data fetches.

## Forms

- `EditForm` with `DataAnnotationsValidator` for simple cases.
- For complex forms, use `Blazored.FluentValidation` with validators in the application layer (not the component).

## Testing

- Component tests with **bUnit** — one test file per component, mirroring the folder structure.
- E2E with **Playwright** targeting the Blazor app.
- Don't test framework behaviour — focus on your component's contract.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards frontend/blazor`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Component primitives | **MudBlazor** | Radzen Blazor | MudBlazor is fully free + MIT; Radzen has free + paid tiers (free is fine but watch the license) |
| Forms / validation | **Blazored.FluentValidation** | DataAnnotations | FluentValidation for complex rules; DataAnnotations only for trivial fields |
| State (cross-component) | scoped services + `IServiceProvider` | Fluxor (Redux-style) | scoped DI services for most cases; Fluxor only if you really need time-travel/devtools |
| Persistent state | **PersistentComponentState** (built-in) | localStorage via JS interop | built-in for cross-rendermode persistence |
| Charts | **ApexCharts.Blazor** (open source) | Telerik Blazor 💰 | ApexCharts is MIT and capable; Telerik is paid commercial — escalate first |
| Tables / grids | **QuickGrid** (built-in) | Telerik / Syncfusion 💰 | QuickGrid covers 90% of cases — try it before reaching for paid grids |
| Styling | **Tailwind CSS** (in tech-stack) | MudBlazor's theming | Tailwind for utility-first; MudBlazor's theme system if you're already all-in on it |
| E2E testing | **Playwright** (in tech-stack) | bUnit for components | Playwright against the running Blazor app |
| Component testing | **bUnit** (in tech-stack) | — | one test file per component, mirroring folder structure |
| HTTP from components | **HttpClient** (DI-injected) | RestSharp | injected `HttpClient` with typed clients (`AddHttpClient<TClient>`); RestSharp adds nothing in modern .NET |

⚠ **Paid commercial Blazor component vendors** (Telerik, DevExpress, Syncfusion, Radzen Premium) are flagged because the .NET frontend ecosystem has a high share of them. Default to free + MIT alternatives above; if a paid component is genuinely required, escalate to the user per the Philosophy section of `common/standards.md`.

## What to avoid

- `@inject IJSRuntime` for primary interactions — use `@rendermode InteractiveServer` instead and let Blazor handle it.
- Long-running operations in sync `OnInitialized` — always use the async variant.
- Putting business logic in components — push to application services injected via DI.
- Mixing render modes carelessly across a tree — it changes when components run and what state they see.
- Adding a paid Blazor component vendor without escalating to the user (see Recommended packages above).
