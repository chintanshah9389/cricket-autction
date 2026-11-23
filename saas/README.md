# Cricket Auction SaaS (feature/saas-railway)

Online-first multi-tenant auction backend:

- **Postgres** (Railway) — orgs, users, tournaments, auction progress
- **Cloudflare R2** — images/videos; DB stores object keys/paths
- Resume anytime from server state

## Local setup (real Postgres + R2)

1. Copy env file:

```bash
cp .env.example .env
```

2. Fill `.env` with:
   - Railway **public** `DATABASE_URL`
   - Cloudflare R2 account id, access key, secret, bucket, public base URL
   - JWT secrets + first Super Admin email/mobile/password

3. Install and migrate:

```bash
npm install
npm run saas:migrate
npm run saas:seed-superadmin
npm run saas
```

4. Check:

- `GET http://localhost:3000/api/v1/health` → `{ ok, db, r2 }`
- `POST /api/v1/auth/login` with `{ "login": "admin@example.com", "password": "..." }`

## Product UI (`/app`)

| Page | Path |
|---|---|
| Home | `/app/` |
| Login | `/app/login.html` |
| Register (org owner) | `/app/register.html` |
| Org dashboard | `/app/dashboard.html` |
| Members | `/app/members.html` |
| Tournaments | `/app/tournaments.html` |
| Super Admin (platform backend) | `/app/super.html` |

## Useful APIs (v1 scaffold)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | DB + R2 ping |
| POST | `/api/v1/auth/login` | email **or** mobile + password |
| POST | `/api/v1/auth/register-owner` | create owner + org |
| POST | `/api/v1/auth/logout` | revoke refresh session |
| GET | `/api/v1/auth/me` | current user |
| GET/POST | `/api/v1/orgs` | list/create orgs (create = Super Admin) |
| GET/POST | `/api/v1/orgs/:id/members` | org user admin |
| GET/POST | `/api/v1/orgs/:id/tournaments` | tournaments |
| GET | `/api/v1/tournaments/:id/snapshot` | full desk bootstrap from DB |
| PUT | `/api/v1/tournaments/:id/config` | save tournament + division config |
| PUT | `/api/v1/tournaments/:id/divisions/:code/players` | save roster |
| PUT/DELETE | `/api/v1/tournaments/:id/divisions/:code/auction` | auction snapshot |
| GET/PUT | `/api/v1/tournaments/:id/partners` | partners |
| POST | `/api/v1/media/sign-upload` | R2 signed upload URL |
| GET | `/api/v1/super/overview` | Super Admin platform counts |
| GET | `/api/v1/super/db` | Super Admin DB table row counts |
| GET | `/api/v1/super/organizations` | Super Admin orgs + member/tournament counts |
| GET | `/api/v1/super/users` | Super Admin users list |
| GET | `/api/v1/super/auctions` | Super Admin auction sessions |

## Two servers

| Command | Mode |
|---|---|
| `npm start` | Legacy local desk (`data-project/` files) — optional offline |
| `npm run saas` | DB-only SaaS product (org login → tournament → desk) |

Live Railway uses **Postgres + R2 only** (no `data-project/` on the product path).
