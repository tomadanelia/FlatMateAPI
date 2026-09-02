# Flatmate backend

NestJS + TypeScript API for finding compatible roommates. PostgreSQL is hosted by Supabase and accessed through Prisma 7.

## Architecture

The matching engine uses the Strategy pattern. Each implementation in `src/modules/matching/algorithms` has one job and returns a normalized `0..1` score plus an explanation. `AlgorithmRegistry` resolves implementations and `MatchingService` combines only the enabled strategies using database-configured weights.

Current strategies:

- `PERSONALITY`: similarity between the latest completed test's normalized trait scores.
- `TASTE`: Jaccard similarity across normalized Spotify/Letterboxd titles, artists and genres.
- `LIFESTYLE`: compatibility across cleanliness, schedule, sociability, noise, guests, pets and smoking.

Country/city, currency, overlapping rent budgets, reciprocal gender preferences, reciprocal `lookingFor` audience rules, discoverability, and onboarding are hard database-level candidate filters. `lookingFor` accepts `male`, `female`, or `all` and defaults to `all` for existing and new profiles when omitted. The same audience rule protects public profile viewing and direct messages. Matching is calculated from current profile data on demand. A cheap budget/lifestyle pass selects at most 50 candidates before personality and taste run, and at most 20 matches are returned. Missing optional data omits that strategy for that pair and the remaining weights are normalized, so it does not unfairly become a zero. Stored move-in dates are retained for compatibility but are not used by matching.

To add or replace an algorithm, implement `MatchingAlgorithm`, register the class in `MatchingModule` and add it to `AlgorithmRegistry`. Algorithm scores and explanations are returned to the caller but are not persisted.

## Setup

1. Create a Supabase project and copy `.env.example` to `.env`.
2. Put the pooled Supabase PostgreSQL URL in `DATABASE_URL` and direct port-5432 URL in `DIRECT_URL`. Runtime queries use `DATABASE_URL` through Prisma 7's `@prisma/adapter-pg`; Prisma CLI migrations use `DIRECT_URL` from `prisma.config.ts`. Set `JWT_SECRET` to a separate long random value and optionally change `JWT_EXPIRES_IN` (defaults to `7d`). Set `RESEND_API_KEY` and, in production, set `RESEND_FROM_EMAIL` to a sender on a domain verified in Resend.
3. Run:

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npx prisma db seed
npm run start:dev
```

The migrations create users, housing/lifestyle profiles, versioned tests and questions, attempts/responses/trait scores, external integrations and taste items, algorithm configuration, direct conversations, and messages.

## Main endpoints

- `POST /api/auth/signup` — create an unverified account and email a one-time code.
- `POST /api/auth/verify-email` — verify the signup code and receive a JWT.
- `POST /api/auth/resend-verification` — replace and resend an expired or lost code.
- `POST /api/auth/login` — authenticate a verified account with email/password and receive a JWT; no code is required again.
- `PUT /api/users/profile` — create/update onboarding, rent and lifestyle data.
- `PATCH /api/users/me/avatar` — save, replace or clear the authenticated user's profile image URL.
- `GET /api/users/me` — return the authenticated user's private profile and onboarding state (JWT required).
- `GET /api/users/:id` — view a safe public profile with personality, tastes, housing, and lifestyle preferences (JWT required).
- `POST /api/users/:id/block` / `DELETE /api/users/:id/block` — block or unblock another user (JWT required).
- `GET /api/users/me/blocks` — list users blocked by the current user (JWT required).
- `GET /api/tests` and `GET /api/tests/:slug` — available tests/questions.
- `POST /api/tests/submissions` — score and store a completed test.
- `POST /api/integrations/connect` — record a Spotify or Letterboxd identity.
- `POST /api/integrations/letterboxd/connect` — verify a public Letterboxd username and sync its favorite films.
- `GET /api/integrations/letterboxd/:userId/favorites` — return a user's stored Letterboxd favorite films and poster URLs.
- `POST /api/integrations/taste/sync` — ingestion boundary for normalized provider data.
- `POST /api/matches/search` — calculate current matches on demand. Pass `algorithms` to run only selected ones.
- `POST /api/messages/conversations` — get or create a direct conversation (JWT required).
- `GET /api/messages/conversations` — list the current user's conversations (JWT required).
- `GET /api/messages/conversations/:id` — page through newest-first message history (JWT required).
- `POST /api/messages/conversations/:id` — persist and broadcast a message (JWT required).
- `PATCH /api/messages/conversations/:id/read` — mark received messages as read (JWT required).
- `GET /admin` — algorithm control page (requires an admin Bearer token).
- `GET/PATCH /api/admin/algorithms[/:key]` — list or update matching algorithms (admin only).
- `POST /api/admin/tests/:testDefinitionId/questions` — bulk-create questions (admin only).
- `PATCH /api/admin/questions/:id` — edit a question (admin only).
- `GET /api/admin/users` — list user display names and IDs in sorted order (admin only).
- `GET /api/admin/users/by-test-status/:status` — list user IDs, names, and emails filtered by `SHORT_ONLY`, `LONG_ONLY`, or `BOTH` completed-test status (admin only).
- `GET /api/admin/users/:id/completion-status` — show whether a user completed the short test, long test, both, or neither, plus taste-selection counts (admin only).
- `PATCH /api/admin/users/:id/role` — grant or revoke a user's admin role (admin only).
- `DELETE /api/admin/users/:id` — delete a user and all user-owned data through database cascades (admin only).
- `DELETE /api/admin/messages` — delete every message and retain empty conversations (admin only).

Signup request (the response tells the client to show its code-entry screen):

```json
{
  "email": "person@example.com",
  "password": "StrongPass1",
  "displayName": "Taylor"
}
```

Verify once and use the returned JWT:

```bash
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com","code":"123456"}'
```

Future logins need only the password:

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

## Realtime messaging

Socket.IO is exposed at the `/chat` namespace using WebSocket transport. Mount the connection in the website's authenticated app shell, not in the chat page. This lets `message:new` update a global notification badge or toast from any page. The server creates sockets only for browser sessions that currently have the website open; offline accounts consume no socket resources.

```ts
const socket = io(`${apiOrigin}/chat`, {
  transports: ["websocket"],
  auth: { token: accessToken },
});

socket.on("message:new", (message) => showGlobalMessageNotification(message));

// Run from the app-shell cleanup on logout or when it unmounts.
socket.disconnect();
```

Socket.IO automatically reconnects after temporary network loss while the app shell remains mounted. A connection emits `realtime:ready` after authentication. The server also emits `message:new` and `conversation:read`; HTTP sends and read updates produce the same realtime events as their Socket.IO equivalents. Socket.IO's transport-level ping/pong detects dead sessions and releases them automatically, including when a browser closes without running application cleanup.

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

The authentication endpoints issue signed JWTs containing `sub` (the user ID), `email`, and `role`. Every admin route requires a valid `Authorization: Bearer <token>` header and the `ADMIN` role. Before exposing all other user-scoped endpoints publicly, apply JWT authentication there too and derive `userId` from the verified token instead of trusting IDs in request bodies. Both Big Five questionnaires are active: `big-five-v1` is the short 10-item option and `big-five-v2` is the longer 50-item IPIP factor-marker inventory. The frontend can offer either version; if a user completes the long version after the short one, the new attempt becomes the personality result used by profiles and matching while the short attempt remains in history.

## Verification

```bash
npm run build
npm test
npx prisma validate
```
