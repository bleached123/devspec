## Python conventions

- Python **3.14+** unless documented otherwise (current stable, released October 2025). Avoid 3.11 in new projects.
- `ruff` for formatting AND linting. `ruff format` on save, `ruff check` in CI (NO `--exit-zero`) — any lint finding fails the build.
- Type hints on every public function signature. `pyright` (or `mypy --strict`) in CI — failing on warnings, not just errors.
- **Warnings as errors**: enable `filterwarnings = ["error"]` under `[tool.pytest.ini_options]` so runtime `DeprecationWarning`/`PendingDeprecationWarning` break tests. `# noqa` and `# type: ignore` require a comment with rationale and an issue link.
- `uv` for dependency management. Lockfile (`uv.lock`) committed.
- Imports sorted by `ruff` (stdlib → third-party → local).

## Modern Python idioms (3.12 / 3.13 / 3.14)

- **PEP 695 type aliases** — use the `type` statement, not `TypeAlias`:
  ```python
  type UserId = NewType("UserId", int)
  type ResultOf[T] = T | Exception
  ```
- **PEP 695 generic syntax** — class/function generics inline, no `TypeVar`:
  ```python
  def first[T](items: list[T]) -> T: ...
  class Cache[K, V]: ...
  ```
- **Exception groups (PEP 654)** — `except*` for parallel/concurrent error handling:
  ```python
  try:
      await asyncio.gather(*tasks)
  except* HTTPError as eg:
      ...
  ```
- **`typing.deprecated`** to mark deprecated APIs so type checkers warn callers.
- **Structural pattern matching** (`match`/`case`) for tagged-union-style dispatch.

## Style

- Names: `snake_case` for functions/modules/variables, `PascalCase` for classes, `SCREAMING_SNAKE_CASE` for module-level constants.
- Prefer `@dataclass(frozen=True, slots=True)` or `pydantic.BaseModel` for value-like objects.
- Avoid mutable default arguments (`def f(x=[])`). Use `None` and create inside.
- Use `pathlib.Path`, not raw strings, for filesystem paths.
- Use `tomllib` (stdlib in 3.11+) for reading TOML — no third-party dep.

## Error handling

- Raise specific exceptions. Catching `Exception` or bare `except:` requires a `# noqa` justification.
- API boundaries return typed responses; don't leak internal exceptions to clients. Map at the boundary.
- Use context managers (`with`) for anything that needs cleanup.

## Async

- One concurrency model per process — don't mix `asyncio` and threads casually.
- Async functions return `Awaitable[T]`. Don't block in async code (`time.sleep`, sync HTTP — use `httpx.AsyncClient`).
- `asyncio.TaskGroup` (3.11+) preferred over `asyncio.gather` for structured concurrency.
- Use `asyncio.timeout()` context manager rather than `wait_for()` in 3.11+.

## Project layout

- `src/<package>/` for the application package. Tests in `tests/` mirroring the package structure.
- `pyproject.toml` for all config (build, ruff, pytest, pyright) — no `setup.py`, no `setup.cfg`.
- One module per concern; keep files under ~400 lines.
- FastAPI app structure: `src/<pkg>/api/` for routers, `src/<pkg>/domain/` for entities, `src/<pkg>/services/` for use cases.

## Testing

- `pytest` with fixtures, not unittest classes.
- Test files named `test_*.py`; functions named `test_*`.
- Use `pytest.mark.parametrize` for data-driven cases.
- Integration tests use Testcontainers for real DBs/services.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards backend/python`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Web framework | **FastAPI** (in tech-stack) | Litestar | FastAPI for ecosystem + tooling; Litestar for strict performance / DI |
| Validation / DTOs | **pydantic v2** | dataclasses + cattrs | pydantic is the de-facto standard, integrates with FastAPI |
| HTTP client | **httpx** | aiohttp | httpx for async + sync from one API; aiohttp when you're already in its event loop |
| ORM (async) | **SQLAlchemy 2.0** | SQLModel | SQLAlchemy 2.0 async + typed for serious data work; SQLModel for FastAPI quick starts |
| Settings / config | **pydantic-settings** | dynaconf | pydantic-settings keeps config typed and validated at startup |
| Logging | **structlog** | stdlib `logging` | structlog for structured JSON; stdlib `logging` is fine when no aggregation is needed |
| Task queue | **arq** (redis-based) | celery | arq is async-native and lightweight; celery for legacy / sync workloads |
| Test framework | **pytest** (in tech-stack) | unittest | pytest + fixtures; unittest only when stdlib-only is required |
| Test mocking | **pytest-mock** + `unittest.mock` | freezegun for time | use real fixtures + Testcontainers for integration |
| Date / time | stdlib `datetime` + `zoneinfo` | arrow / pendulum | stdlib is sufficient since Python 3.9 |

All free + permissively licensed.

## Dependency selection (PyPI)

The universal dep-cost rule (see Philosophy in `common/standards.md`) applies. PyPI is mostly free, but quality and maintenance vary widely:

- **Check PyPI page**: last release date, license, GitHub repository activity. Packages without a linked source repository are flagged.
- **Prefer mainstream + well-maintained**: stdlib first, then `pydantic`, `fastapi`, `httpx`, `sqlalchemy`, `pytest`. Avoid niche packages with one maintainer and no recent activity.
- **`pip-audit`** runs in CI on every PR (pipeline fragment's `security` job). New advisories fail the build.
- **Pin via `uv.lock` / `pip-compile` / `requirements.txt`** with hashes (`--require-hashes`).
- **Document every new dep in `design.md`** with license, last release, why over alternatives.

## What to avoid

- `os.path` — use `pathlib` instead.
- `% formatting` or `.format()` — use f-strings.
- `Optional[X]` — write `X | None` (PEP 604).
- `Dict`, `List`, `Tuple` from `typing` — use built-in `dict`, `list`, `tuple` generics (3.9+).
- `print` for logging — use `logging` module with structured fields.
- Adding a dep without checking last-release date and license (see Dependency selection above).
