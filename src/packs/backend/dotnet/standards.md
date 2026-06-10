## .NET conventions

- Target `net10.0` for new projects (current LTS, released November 2025). `net8.0` only if a downstream constraint forces it.
- C# 14 language features available by default — `LangVersion` only set explicitly when a higher version is needed.
- Nullable reference types enabled project-wide (`<Nullable>enable</Nullable>`).
- **Warnings as errors**: `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` in every project's `<PropertyGroup>`. Pair with `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>` so `dotnet build` fails on style violations. Use `<WarningsNotAsErrors>` only for documented, time-boxed exceptions linked to a ticket.
- Async methods end with `Async` and return `Task`/`Task<T>`. No `async void` outside event handlers.
- Interfaces start with `I` (`IBookingRepository`).
- Prefer `record` for immutable DTOs and value objects.

## Modern C# idioms (12 / 13 / 14)

- **Primary constructors** for classes and structs — kill boilerplate when fields are just stored:
  ```csharp
  public sealed class BookingService(IBookingRepository repo, ILogger<BookingService> log)
  {
      public Task<Result> CreateAsync(...) => ...;
  }
  ```
- **Collection expressions** for arrays/lists/spans: `int[] xs = [1, 2, 3];`
- **`required` members** so the compiler enforces initialization at construction.
- **File-scoped namespaces** in every new file (`namespace MyApp.Domain;`).
- **Pattern matching** for control flow over `if`/`else` chains where it reads better.

## File size and structure

- Single type per file, file name matches the type.
- Aim for < 300 lines per class. If larger, split responsibilities.
- File-scoped namespaces remove one level of indentation — use them.

## Error handling

- Throw specific exception types; never `throw new Exception(...)`.
- API boundaries: catch and map to a `ProblemDetails` response. Don't leak internal exceptions.
- Use `ArgumentNullException.ThrowIfNull(arg)` in guard clauses (NET 6+).

## Async and threading

- Don't block on async (`.Result`, `.Wait()`). Use `ConfigureAwait(false)` in library code; rarely needed in ASP.NET.
- `CancellationToken` is a parameter on every async API surface that does I/O.
- `Task.WhenAll` for parallel awaits; `Parallel.ForEachAsync` for CPU-bound parallelism.

## Testing

- xUnit is the default. `Microsoft.Testing.Platform` for new projects targeting net10.
- `Verify` for snapshot tests when assertions are large.
- Integration tests use Testcontainers or a transactional rollback against a real DB.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards backend/dotnet`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Serialization (JSON) | **System.Text.Json** | — | stdlib; `Newtonsoft.Json` is legacy, slower, and adds a dep with its own attribute model |
| Validation | **FluentValidation** | DataAnnotations | FluentValidation for complex rules / composition; DataAnnotations only for trivial scaffold-time checks |
| Mediator / CQRS | **MediatR** | direct DI | MediatR only when CQRS pattern is genuinely paying off — otherwise direct service classes via DI |
| Object mapping | **Mapster** | manual | Mapster is faster than AutoMapper and source-gen-friendly; prefer hand-written mappers in small domains |
| ORM | **EF Core 10** | Dapper | EF Core for code-first domain modelling + migrations; Dapper for hot-path read queries where you write SQL |
| Logging | **Serilog** | Microsoft.Extensions.Logging defaults | Serilog with structured properties + sinks for production; the defaults for prototypes |
| Test framework | **xUnit** (in tech-stack) | — | NUnit is also fine but xUnit is the .NET ecosystem default |
| Test assertions | **FluentAssertions** | xUnit asserts | better failure messages; `Verify` for snapshot tests when state is large |
| Integration testing | **Testcontainers** | manual fixtures | spins up real DBs/services per test class — no mocks for systems you own the contract of |

All free + MIT/Apache-licensed. Paid commercial NuGet packages (Telerik, DevExpress, Syncfusion, ComponentOne, Aspose, Spire) require explicit user escalation — see "Dependency selection (NuGet)" below.

## Dependency selection (NuGet)

The universal dep-cost rule (see the Philosophy section of `common/standards.md`) applies strictly here. The .NET ecosystem mixes excellent free libraries with many commercial offerings — it is unusually easy to add a paid dependency by accident.

- **Avoid paid commercial NuGet packages without explicit user approval.** Common examples that often surprise: Telerik UI, DevExpress, Syncfusion (free only for small businesses), ComponentOne, Aspose, Spire, Stimulsoft Reports. When the only library that solves a problem is paid, **escalate to the user** before adding it — explain the alternative, the cost structure, and the lock-in risk.
- **Verify license before adding.** Check the NuGet package page for `License`. MIT/Apache/BSD/MIT-X11 are safe defaults. Anything with a EULA or per-seat purchase model requires an explicit decision in `design.md`.
- **Prefer `Microsoft.*` and aspnetcore-aligned community packages** over third-party variants where they exist. They track .NET releases, are free, and benefit from the largest user base.
- **Check `Repository url` and last commit date** on nuget.org. Packages with `Repository` blank or no commits in 18+ months are risky — flag in review.
- **Run `dotnet list package --vulnerable` and `dotnet list package --deprecated`** in CI (the pipeline fragment's `security` job does this). New advisories fail the build.
- **Pin versions explicitly**: `<PackageReference Include="X" Version="1.2.3" />` — no floating wildcards (`1.*`). Lockfile mode is enabled by default in net8+ via `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` — commit `packages.lock.json`.
- **Document every new dep in `design.md`** with a `## Dependencies` subsection: name, license, last release date, why over alternatives, cost (if any).

## What to avoid

- `Newtonsoft.Json` in new code — use `System.Text.Json`.
- `ConfigurationBuilder` chains in `Program.cs` — use `WebApplication.CreateBuilder(args)`.
- `IHttpClientFactory` constructor injection without named/typed clients — register typed clients.
- Paid NuGet packages added without escalating to the user (see Dependency selection above).
