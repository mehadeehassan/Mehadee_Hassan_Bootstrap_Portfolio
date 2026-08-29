# Mehadee Hassan Portfolio

This repository contains the unchanged public portfolio and a protected SQLite-backed admin CMS.

## Local setup

Requires Node.js 22+:

```sh
npm install
cp .env.example .env
# Set a unique 12+ character ADMIN_PASSWORD and a random SESSION_SECRET (32+ chars)
npm run seed
npm start
```

`npm run seed` is safe to run against an existing database: it creates the bootstrap Super Admin only when missing and never replaces existing portfolio records. Never commit `.env`, `uploads/`, or database backups.

Open `/admin/` to sign in. The public site reads `GET /api/public/portfolio` and is not redesigned by the CMS.

## Authentication and authorization

Login uses a cryptographically random, database-backed, hashed session token in an HttpOnly, SameSite=Lax cookie (Secure in production), with an eight-hour expiry. Logout, password changes, resets, and account disabling invalidate sessions. Passwords are bcrypt hashes only and are never returned by an API. Login and recovery requests are rate limited. Forgot-password responses are deliberately identical for known and unknown email addresses; reset tokens are hashed, single-use, short-lived, and never logged or returned. The built-in Nodemailer adapter sends reset links when SMTP is configured; without SMTP, recovery requests remain intentionally generic and no reset link is delivered.

Roles use explicit permissions: `super_admin` has full access, `editor` manages portfolio content but not users/security settings, and `viewer` is read-only. Every admin API route enforces permissions server-side and returns 403 when unauthorized. The final active Super Admin cannot be deleted, disabled, or demoted.

## Admin API groups

- `/api/admin/login`, `/logout`, `/session`, `/forgot-password`, `/reset-password`, `/change-password`
- Portfolio CRUD: `/profiles`, `/skills`, `/experiences`, `/responsibilities`, `/projects`, `/social-links`, `/settings`
- Media: `/media`, `/media/upload`, `/media/:id/replace` (validated JPEG/PNG/WEBP/PDF, random safe filenames, 5 MB limit, usage-aware deletion and reference-preserving replacement)
- `/users` (Super Admin only), `/audit-logs`, `/dashboard`, `/health`, `/backup`

Mutations validate input and write an audit record containing action, actor, resource, timestamp, IP, and user agent—never credentials, hashes, session secrets, or reset tokens.

## Production configuration

Set `NODE_ENV=production`, a strong random `SESSION_SECRET`, `APP_URL`/`API_URL`, `DB_PATH` (or the deployment's database path), and unique bootstrap credentials before the first seed. Configure `MEDIA_STORAGE_PROVIDER` and its provider URL/key/secret for durable object storage; local `UPLOADS_DIR` is for development only. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` for recovery email. Set `CORS_ORIGIN` only to the trusted admin origin. Serve behind HTTPS so Secure cookies work, keep SQLite/backups outside the public directory, and schedule encrypted off-host database backups.

### Render deployment

The included [`render.yaml`](./render.yaml) defines a production web service with automatic Git deploys, a persistent disk for SQLite and uploads, the safe bootstrap seed command, and the unauthenticated `/healthz` health check. In Render, create a Blueprint from this repository, then set `APP_URL`, `API_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the SMTP variables in the Environment tab. Do not commit those values. Deploy the combined service on Render when the frontend uses its relative `/api` URLs; keeping the frontend on a separate Vercel/Netlify site requires configuring that site to call the Render API URL and allowing its origin in `CORS_ORIGIN`. The `start` script also runs the non-destructive seed before starting the server, which supports plans without a pre-deploy job; use a persistent disk or external database/storage for production durability.

## Validation

```sh
npm run check
```

The existing portfolio assets and content are preserved by startup migrations and the non-destructive seed path.
