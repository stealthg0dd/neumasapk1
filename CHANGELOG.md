# Changelog

## 2026-05-18 - Prompt 10 Production Hardening and Release Validation

### Web hardening
- Enforced protected route gating at runtime with Next.js middleware entrypoint.
- Added additional protected-path redirect guard logic in Supabase proxy utilities.
- Added explicit homepage H1 contract marker for crawler/readability verification.

### Public content and trust surface
- Delivered public content engine pages for research, compare, glossary, trust, legal, and policy surfaces.
- Added structured data coverage updates, including Organization/ContactPoint and glossary term schemas.
- Updated public site chrome and footer trust links to include policy and contact destinations.

### Reliability and regression coverage
- Added/updated backend regression tests for scan pipeline, failover behavior, and inventory API stability.
- Validated backend auth, scan upload, and inventory API routes through automated tests and smoke checks.

### Validation results summary
- Frontend quality gates passed locally: lint, unit tests, and production build.
- Backend quality gates passed locally: pytest suite (116 passed).
- Smoke test validated health, signup/login, inventory GET/POST, and scan upload.
- Worker/provider-dependent smoke steps remain environment dependent (background worker/provider availability).

### Staging/deploy notes
- Preview deployment was created successfully for neumas-web via Vercel.
- Direct preview probing returned 401 because deployment protection is enabled for preview.
- Local runtime and CI-backed validation were used for staging-equivalent gate evidence in this cycle.
