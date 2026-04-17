# GitHub Actions Secrets

All secrets are set at **repository level** in Settings → Secrets and variables → Actions.

## Railway


| Secret                 | Description                                                                            | How to obtain                                             |
| ---------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `RAILWAY_TOKEN_NEUMAS` | Railway deploy token (project-scoped)                                                  | Railway dashboard → Project Settings → Tokens → New Token |
| `RAILWAY_API_URL`      | Base URL of the deployed neumas-api service (e.g. `https://neumas-api.up.railway.app`) | Railway dashboard → Service → Deployments tab             |


## Vercel


| Secret                     | Description                        | How to obtain                                             |
| -------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `VERCEL_TOKEN`             | Vercel personal access token       | vercel.com → Account Settings → Tokens → Create           |
| `VERCEL_ORG_ID`            | Vercel team/org ID                 | `vercel env ls` output or Vercel team settings URL        |
| `VERCEL_PROJECT_ID_NEUMAS` | Vercel project ID for `neumas-web` | `cat neumas-web/.vercel/project.json` after `vercel link` |


### Why Vercel might not update when you push

- **Railway does not deploy Vercel.** Railway’s Git integration only deploys whatever services you connected in Railway (e.g. API/worker). Updating production on Vercel is done either by **this repo’s** `deploy-web.yml` workflow (Vercel CLI + the secrets above) or by **Vercel’s own** Git integration in the Vercel project settings. Do not use both paths for the same branch unless you intend to double-deploy.
- **Missing secrets:** If `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or `VERCEL_PROJECT_ID_NEUMAS` are not set in GitHub, `deploy-web.yml` fails at the first step with an explicit error (it no longer skips deploy silently).
- **Environment protection:** If the `production` environment has required reviewers, deployments stay pending until someone approves in **Actions → Deploy Web → Review deployments**.
- **Native Vercel Git:** If the Vercel project is connected to GitHub with auto-deploy but you disabled it or pointed the wrong **Root Directory** (must be `neumas-web` for this monorepo), the dashboard deployment will not match pushes from this repo.

Pushes that only change `.github/workflows/deploy-web.yml` still trigger **Deploy Web** and the **CI** web job (so the deploy workflow can wait on a green check).

## Sentry


| Secret                      | Description                                                                | How to obtain                                                             |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN`         | Sentry internal integration token (scopes: `project:releases`, `org:read`) | sentry.io → Settings → Developer Settings → Internal Integration → Create |
| `SENTRY_ORG`                | Sentry organisation slug (e.g. `my-org`)                                   | sentry.io → Settings → General → Organization Slug                        |
| `SENTRY_PROJECT_NEUMAS_WEB` | Sentry project slug for the web frontend                                   | `neumas-web` (verify in sentry.io → Projects)                             |


> **Note:** The Sentry DSN (`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`) is **not** a secret — it is safe to commit to `.env.example`. Only the auth token grants write access and must be kept secret.

## Slack webhooks

Each webhook is an **Incoming Webhook** URL tied to a specific channel. Create them at api.slack.com → Your Apps → Incoming Webhooks.


| Secret                        | Channel          | Purpose                              |
| ----------------------------- | ---------------- | ------------------------------------ |
| `SLACK_WEBHOOK_NEUMAS_DEV`    | `#neumas-dev`    | CI failures, security scan alerts    |
| `SLACK_WEBHOOK_NEUMAS_ALERTS` | `#neumas-alerts` | Deploy success/failure notifications |
| `SLACK_WEBHOOK_CTECH_COMMAND` | `#ctech-command` | Cross-team deploy status summary     |


## Agent OS


| Secret             | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `AGENT_OS_URL`     | Base URL of the Agent OS service (e.g. `https://agent-os.example.com`) |
| `AGENT_OS_API_KEY` | API key used in the `X-API-Key` header for heartbeat / register calls  |


## Workflow ↔ Secret mapping


| Workflow            | Secrets required                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`            | `SLACK_WEBHOOK_NEUMAS_DEV`                                                                                                                                                                                                    |
| `deploy-web.yml`    | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_NEUMAS`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_NEUMAS_WEB`, `AGENT_OS_URL`, `AGENT_OS_API_KEY`, `SLACK_WEBHOOK_NEUMAS_ALERTS`, `SLACK_WEBHOOK_CTECH_COMMAND` |
| `deploy-worker.yml` | `RAILWAY_TOKEN_NEUMAS`, `RAILWAY_API_URL`, `AGENT_OS_URL`, `AGENT_OS_API_KEY`, `SLACK_WEBHOOK_NEUMAS_ALERTS`, `SLACK_WEBHOOK_CTECH_COMMAND`                                                                                   |
| `security-scan.yml` | `SLACK_WEBHOOK_NEUMAS_DEV`                                                                                                                                                                                                    |


## Rotation policy

- **Railway token**: rotate whenever a team member with Railway access leaves.
- **Vercel token**: rotate every 90 days or on team-member departure.
- **Sentry auth token**: rotate every 90 days.
- **Slack webhooks**: rotate if a webhook URL is ever committed to the repo by accident.
- **Agent OS API key**: rotate on backend credential audit or compromise.

