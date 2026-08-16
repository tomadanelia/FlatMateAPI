# Flatmate backend

NestJS + TypeScript API for finding compatible roommates. PostgreSQL is hosted by Supabase and accessed through Prisma 7.

## Architecture

The matching engine uses the Strategy pattern. Each implementation in `src/modules/matching/algorithms` has one job and returns a normalized `0..1` score plus an explanation. `AlgorithmRegistry` resolves implementations and `MatchingService` combines only the enabled strategies using database-configured weights.

Current strategies:

- `PERSONALITY`: similarity between the latest completed test's normalized trait scores.
- `TASTE`: Jaccard similarity across normalized Spotify/Letterboxd titles, artists and genres.
- `LIFESTYLE`: compatibility across cleanliness, schedule, sociability, noise, guests, pets and smoking.

City, currency and overlapping rent budgets are hard candidate filters. Missing optional data omits that strategy for that pair and the remaining weights are normalized, so it does not unfairly become a zero.

To add or replace an algorithm, implement `MatchingAlgorithm`, register the class in `MatchingModule` and add it to `AlgorithmRegistry`. Callers and stored match-result structure remain unchanged. Each run stores the algorithm version, score, weight and explanation for auditability.

## Setup

1. Create a Supabase project and copy `.env.example` to `.env`.
2. Put the pooled Supabase PostgreSQL URL in `DATABASE_URL` and direct port-5432 URL in `DIRECT_URL`. Runtime queries use `DATABASE_URL` through Prisma 7's `@prisma/adapter-pg`; Prisma CLI migrations use `DIRECT_URL` from `prisma.config.ts`. Set `JWT_SECRET` to a separate long random value and optionally change `JWT_EXPIRES_IN` (defaults to `7d`).
3. Run:

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npx prisma db seed
npm run start:dev
```

The initial migration creates users, housing/lifestyle profiles, versioned tests and questions, attempts/responses/trait scores, external integrations and taste items, algorithm configuration, match runs/results, and per-algorithm score audit records.

## Main endpoints

- `POST /api/auth/signup` — create an account and receive a JWT.
- `POST /api/auth/login` — authenticate with email/password and receive a JWT.
- `PUT /api/users/profile` — create/update onboarding, rent and lifestyle data.
- `GET /api/tests` and `GET /api/tests/:slug` — available tests/questions.
- `POST /api/tests/submissions` — score and store a completed test.
- `POST /api/integrations/connect` — record a Spotify or Letterboxd identity.
- `POST /api/integrations/letterboxd/connect` — verify a public Letterboxd username and sync its favorite films.
- `GET /api/integrations/letterboxd/:userId/favorites` — return a user's stored Letterboxd favorite films and poster URLs.
- `POST /api/integrations/taste/sync` — ingestion boundary for normalized provider data.
- `POST /api/matches/search` — run enabled strategies. Pass `algorithms` to run only selected ones.
- `GET /admin` — algorithm control page (requires an admin Bearer token).
- `GET/PATCH /api/admin/algorithms[/:key]` — list or update matching algorithms (admin only).
- `POST /api/admin/tests/:testDefinitionId/questions` — bulk-create questions (admin only).
- `PATCH /api/admin/questions/:id` — edit a question (admin only).
- `PATCH /api/admin/users/:id/role` — grant or revoke a user's admin role (admin only).

Signup request:

```json
{
  "email": "person@example.com",
  "password": "StrongPass1",
  "displayName": "Taylor"
}
```

Login and use the returned JWT:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"StrongPass1"}'

curl http://localhost:3000/api/admin/algorithms \
  -H "Authorization: Bearer <accessToken>"
```

Grant admin access to another user:

```bash
curl -X PATCH http://localhost:3000/api/admin/users/00000000-0000-0000-0000-000000000000/role \
  -H "Authorization: Bearer <adminAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}'
```

The promoted user must log in again to receive a token containing the new `ADMIN` role. To bootstrap the first admin manually in PostgreSQL:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'admin@example.com';
```

Bulk question upload request:

```json
{
  "questions": [
    {
      "code": "C3",
      "prompt": "I plan chores ahead of time.",
      "kind": "LIKERT",
      "trait": "conscientiousness",
      "position": 11,
      "minValue": 1,
      "maxValue": 5,
      "weight": 1
    }
  ]
}
```

Example single-algorithm request:

```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "limit": 20,
  "algorithms": ["PERSONALITY"]
}
```

## Production integration notes

The backend intentionally exposes a provider-neutral taste ingestion endpoint; Spotify OAuth callbacks, token encryption/refresh, and Letterboxd scraping/API ingestion should be implemented as provider adapters around it. Letterboxd has no general public API, so confirm its current terms before choosing an ingestion method. Never store provider tokens unencrypted.

The authentication endpoints issue signed JWTs containing `sub` (the user ID), `email`, and `role`. Every admin route requires a valid `Authorization: Bearer <token>` header and the `ADMIN` role. Before exposing all other user-scoped endpoints publicly, apply JWT authentication there too and derive `userId` from the verified token instead of trusting IDs in request bodies. The included 10-question Big Five seed is only a development questionnaire, not a validated psychological instrument.

## Verification

```bash
npm run build
npm test
npx prisma validate
```
