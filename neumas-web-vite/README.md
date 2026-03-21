# Neumas Web

React + TypeScript dashboard for the Neumas inventory management API.

## Quick start

```bash
cd neumas-web
npm install
cp .env.example .env.local
# edit .env.local if needed (see Configuration below)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Log in with an account that
already exists in your Supabase project (create one via the backend's
`POST /api/auth/signup` if needed).

## Configuration

All runtime configuration is via environment variables prefixed with `VITE_`.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL of the Neumas backend |

### Local development (against local backend)

```bash
# .env.local
VITE_API_BASE_URL=http://localhost:8000
```

### Production (against Railway)

```bash
# .env.local  (or set as a Railway static site env var)
VITE_API_BASE_URL=https://neumas-production.up.railway.app
```

Then run the smoke test against the deployed URL:

```bash
BASE_URL=https://neumas-production.up.railway.app \
  python -m scripts.smoke_test   # from neumas-backend/
```

## Project structure

```
neumas-web/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Router + AuthProvider
    ├── index.css           # Global styles
    ├── types/
    │   └── index.ts        # Shared TypeScript types
    ├── api/
    │   ├── client.ts       # Axios instance + auth interceptor
    │   ├── auth.ts
    │   ├── inventory.ts
    │   ├── predictions.ts
    │   ├── scans.ts
    │   └── shopping.ts
    ├── context/
    │   └── AuthContext.tsx # Token storage + React context
    ├── components/
    │   ├── NavBar.tsx
    │   └── PrivateRoute.tsx
    └── pages/
        ├── LoginPage.tsx
        ├── DashboardPage.tsx
        └── ScanUploadPage.tsx
```

## Auth flow

1. `POST /api/auth/login` → receives `access_token`, `profile.org_id`, `profile.property_id`
2. All three are stored in `localStorage`
3. `apiClient` (Axios) attaches `Authorization: Bearer <token>` to every request automatically
4. A 401 response clears storage and redirects to `/login`
5. `PrivateRoute` redirects unauthenticated visitors to `/login`

## Pages

| Route | Description |
|---|---|
| `/login` | Email + password login form |
| `/` | Dashboard: inventory table, predictions panel, shopping list panel |
| `/scan` | Upload a receipt/barcode image; polls `GET /api/scan/{id}/status` until done |

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

The `dist/` folder is a static site — deploy to Railway Static, Vercel,
Netlify, or any static host.
