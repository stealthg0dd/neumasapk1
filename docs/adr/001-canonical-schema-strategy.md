# ADR 001 — Canonical Schema Strategy

**Date:** 2026-04-17
**Status:** Accepted
**Deciders:** Engineering

---

## Context

The Neumas backend has two schema files:
- `neumas-backend/supabase/schema.sql` — the schema managed in sync with Supabase
- `neumas-backend/setup_schema.sql` — an older bootstrap file used in early development

As the product grows, a single authoritative source of schema truth is required to prevent drift, support safe migrations, and enable team collaboration.

## Decision

1. **`supabase/schema.sql` is the canonical schema source of truth.** All new tables, columns, indexes, RLS policies, and triggers are defined here first.

2. **`setup_schema.sql` is legacy.** It must not be edited, and it must not be used for new deployments. A `LEGACY` header comment will be added to the file.

3. **All schema changes after the baseline require a migration file** in `neumas-backend/migrations/NNNN_description.sql`. Migrations are forward-only. Past migrations must never be edited once applied to any environment.

4. **Migration naming convention:** `NNNN_description.sql` where `NNNN` is zero-padded sequential integer.

5. **`supabase/schema.sql` is kept in sync with cumulative migrations.** After applying a migration, the corresponding DDL is merged back into schema.sql so it always represents full current state.

## Consequences

- Developers know exactly where to look for schema definitions.
- PR reviews can target a single file for schema changes.
- Migrations provide an audit trail of every schema evolution.
- `setup_schema.sql` can be removed in a future cleanup sprint without risk.

## Alternatives Considered

- **Alembic (SQLAlchemy migrations):** Rejected because the codebase uses Supabase SDK (not SQLAlchemy for writes) and Supabase's own migration tooling (`supabase db push`) is already available. Introducing Alembic adds complexity for limited gain.
- **No migration files; just update schema.sql:** Rejected because it provides no rollback point and no audit history.
