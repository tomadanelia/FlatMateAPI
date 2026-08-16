# Flatmate backend API reference

This document describes the HTTP contract implemented by the current NestJS backend. It is intended for frontend developers and documents actual behavior, including current limitations.

## Connection and transport

- Local base URL: `http://localhost:3000`
- JSON API prefix: `/api`
- Send JSON bodies with `Content-Type: application/json`.
- Dates in responses are JSON strings in ISO 8601 UTC form, for example `2026-08-15T12:34:56.789Z`.
- UUID fields use the standard hyphenated UUID form.
- Unknown request-body properties are silently removed by the global validation pipe.
- Optional request properties should be omitted when unused; they generally do not accept JSON `null`.
- CORS is currently enabled without an origin restriction.
- Successful `POST` requests return HTTP `201` unless an endpoint explicitly says otherwise. `GET`, `PUT`, and `PATCH` return HTTP `200`.

## Authentication

Signup and login return a JWT. For protected endpoints send:

```http
Authorization: Bearer <accessToken>
```

Only admin endpoints are protected in the current implementation. The profile, user lookup, test submission, integration, and matching endpoints currently trust the `userId`/`id` supplied by the client and do **not** verify a JWT. This is unsafe for production and frontend code should not assume it will remain that way.

The JWT payload contains `sub` (user ID), `email`, `role`, `iat`, and `exp`. The default lifetime is 7 days unless `JWT_EXPIRES_IN` is configured differently. A user whose role changes must log in again to get a token with the new role.

## Common enums

```json
{
  "UserRole": ["USER", "ADMIN"],
  "Gender": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"],
  "TestType": ["BIG_FIVE", "HEXACO", "CUSTOM"],
  "QuestionKind": ["LIKERT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN", "NUMBER", "TEXT"],
  "IntegrationProvider": ["SPOTIFY", "LETTERBOXD"],
  "IntegrationStatus": ["PENDING", "CONNECTED", "EXPIRED", "ERROR", "DISCONNECTED"],
  "AlgorithmKey": ["PERSONALITY", "TASTE", "LIFESTYLE"]
}
```

## Common error response

NestJS errors have this shape. Validation errors normally put an array of individual constraint messages in `message`; explicit service errors use one string.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HttpError",
  "type": "object",
  "additionalProperties": true,
  "required": ["statusCode", "message"],
  "properties": {
    "statusCode": { "type": "integer", "minimum": 400, "maximum": 599 },
    "message": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "error": { "type": "string" }
  }
}
```

Example:

```json
{
  "message": ["email must be an email"],
  "error": "Bad Request",
  "statusCode": 400
}
```

## 1. Create an account

`POST /api/auth/signup` — public — HTTP `201`

Creates a user, normalizes the email by trimming and lowercasing it, trims `displayName`, and returns a signed access token.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["email", "password", "displayName"],
  "properties": {
    "email": { "type": "string", "format": "email" },
    "password": {
      "type": "string",
      "minLength": 8,
      "maxLength": 72,
      "allOf": [
        { "pattern": "[a-z]" },
        { "pattern": "[A-Z]" },
        { "pattern": "[0-9]" }
      ],
      "description": "Must contain a lowercase letter, uppercase letter, and number."
    },
    "displayName": { "type": "string", "minLength": 1, "maxLength": 80 }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["accessToken", "tokenType", "user"],
  "properties": {
    "accessToken": { "type": "string" },
    "tokenType": { "const": "Bearer" },
    "user": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "email", "displayName", "role"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "email": { "type": "string", "format": "email" },
        "displayName": { "type": ["string", "null"] },
        "role": { "enum": ["USER", "ADMIN"] }
      }
    }
  }
}
```

Errors: `400` validation failure; `409` with `"An account with this email already exists"`.

## 2. Log in

`POST /api/auth/login` — public — HTTP `200`

The email is trimmed and compared case-insensitively after lowercasing.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["email", "password"],
  "properties": {
    "email": { "type": "string", "format": "email" },
    "password": { "type": "string" }
  }
}
```

Response schema: identical to signup's response schema.

Errors: `400` validation failure; `401` with `"Invalid email or password"`.

## 3. Create or update a user's profile

`PUT /api/users/profile` — currently public — HTTP `200`

Creates the user and both related profiles when the supplied `id` does not exist, or updates them when it does. It marks onboarding complete. `countryCode` and `currency` are uppercased. Budget values are integer currency units, not cents.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id", "email", "displayName", "city", "countryCode",
    "minMonthlyBudget", "maxMonthlyBudget", "currency",
    "cleanliness", "socialLevel", "sleepSchedule", "noiseTolerance",
    "guestsFrequency", "smokingAllowed", "petsAllowed", "hasPets"
  ],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "displayName": { "type": "string", "minLength": 1, "maxLength": 80 },
    "birthDate": {
      "oneOf": [
        { "type": "string", "format": "date" },
        { "type": "string", "format": "date-time" }
      ],
      "description": "ISO date or date-time, e.g. 2000-01-31."
    },
    "gender": { "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"] },
    "bio": { "type": "string", "maxLength": 1000 },
    "city": { "type": "string", "minLength": 1, "maxLength": 100 },
    "countryCode": { "type": "string", "minLength": 2, "maxLength": 2, "description": "Use an ISO 3166-1 alpha-2 code." },
    "minMonthlyBudget": { "type": "integer", "minimum": 0 },
    "maxMonthlyBudget": { "type": "integer", "minimum": 1 },
    "currency": { "type": "string", "minLength": 3, "maxLength": 3, "description": "Use an ISO 4217 currency code." },
    "moveInDate": {
      "oneOf": [
        { "type": "string", "format": "date" },
        { "type": "string", "format": "date-time" }
      ],
      "description": "ISO date or date-time."
    },
    "preferredAreas": { "type": "array", "items": { "type": "string" } },
    "cleanliness": { "type": "integer", "minimum": 1, "maximum": 5 },
    "socialLevel": { "type": "integer", "minimum": 1, "maximum": 5 },
    "sleepSchedule": { "type": "integer", "minimum": 1, "maximum": 5 },
    "noiseTolerance": { "type": "integer", "minimum": 1, "maximum": 5 },
    "guestsFrequency": { "type": "integer", "minimum": 1, "maximum": 5 },
    "smokingAllowed": { "type": "boolean" },
    "petsAllowed": { "type": "boolean" },
    "hasPets": { "type": "boolean" }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "housing": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "userId", "city", "countryCode", "minMonthlyBudget", "maxMonthlyBudget", "currency", "moveInDate", "preferredAreas"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "userId": { "type": "string", "format": "uuid" },
        "city": { "type": "string" },
        "countryCode": { "type": "string" },
        "minMonthlyBudget": { "type": "integer" },
        "maxMonthlyBudget": { "type": "integer" },
        "currency": { "type": "string" },
        "moveInDate": { "type": ["string", "null"], "format": "date-time" },
        "preferredAreas": { "type": "array", "items": { "type": "string" } }
      }
    },
    "lifestyle": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "userId", "cleanliness", "socialLevel", "sleepSchedule", "noiseTolerance", "guestsFrequency", "smokingAllowed", "petsAllowed", "hasPets"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "userId": { "type": "string", "format": "uuid" },
        "cleanliness": { "type": "integer" },
        "socialLevel": { "type": "integer" },
        "sleepSchedule": { "type": "integer" },
        "noiseTolerance": { "type": "integer" },
        "guestsFrequency": { "type": "integer" },
        "smokingAllowed": { "type": "boolean" },
        "petsAllowed": { "type": "boolean" },
        "hasPets": { "type": "boolean" }
      }
    }
  },
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "email", "passwordHash", "role", "displayName", "birthDate", "gender", "bio", "avatarUrl", "isDiscoverable", "onboardingComplete", "createdAt", "updatedAt", "housingPreference", "lifestyleProfile"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "passwordHash": { "type": ["string", "null"] },
    "role": { "enum": ["USER", "ADMIN"] },
    "displayName": { "type": ["string", "null"] },
    "birthDate": { "type": ["string", "null"], "format": "date-time" },
    "gender": { "oneOf": [{ "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"] }, { "type": "null" }] },
    "bio": { "type": ["string", "null"] },
    "avatarUrl": { "type": ["string", "null"] },
    "isDiscoverable": { "type": "boolean" },
    "onboardingComplete": { "type": "boolean" },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "housingPreference": { "$ref": "#/$defs/housing" },
    "lifestyleProfile": { "$ref": "#/$defs/lifestyle" }
  }
}
```

Important: this endpoint currently returns `passwordHash`. The frontend must ignore it and must never store or display it; the backend should be changed to omit it.

Errors: `400` validation failure or `"Minimum budget cannot exceed maximum budget"`. Database conflicts such as an email already owned by another user are not currently mapped to a stable client error.

## 4. Get a user and profile

`GET /api/users/:id` — currently public — HTTP `200`

Path parameter: `id` is intended to be a UUID, but the controller does not validate it before querying.

Request body: none.

Response schema: the same user scalar fields, `housingPreference`, and `lifestyleProfile` shown in endpoint 3, plus `integrations`. Unlike endpoint 3, either profile relation may be `null`, and the whole response is `null` when no user is found.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    { "type": "null" },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "email", "passwordHash", "role", "displayName", "birthDate", "gender", "bio", "avatarUrl", "isDiscoverable", "onboardingComplete", "createdAt", "updatedAt", "housingPreference", "lifestyleProfile", "integrations"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "email": { "type": "string", "format": "email" },
        "passwordHash": { "type": ["string", "null"] },
        "role": { "enum": ["USER", "ADMIN"] },
        "displayName": { "type": ["string", "null"] },
        "birthDate": { "type": ["string", "null"], "format": "date-time" },
        "gender": { "oneOf": [{ "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"] }, { "type": "null" }] },
        "bio": { "type": ["string", "null"] },
        "avatarUrl": { "type": ["string", "null"] },
        "isDiscoverable": { "type": "boolean" },
        "onboardingComplete": { "type": "boolean" },
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" },
        "housingPreference": { "description": "Null or the housing object from endpoint 3" },
        "lifestyleProfile": { "description": "Null or the lifestyle object from endpoint 3" },
        "integrations": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["provider", "username", "status", "lastSyncedAt"],
            "properties": {
              "provider": { "enum": ["SPOTIFY", "LETTERBOXD"] },
              "username": { "type": ["string", "null"] },
              "status": { "enum": ["PENDING", "CONNECTED", "EXPIRED", "ERROR", "DISCONNECTED"] },
              "lastSyncedAt": { "type": ["string", "null"], "format": "date-time" }
            }
          }
        }
      }
    }
  ]
}
```

Important: this endpoint also currently exposes `passwordHash`. Treat that field as an accidental backend leak. Invalid UUID syntax may result in a database error rather than a clean `400`.

## 5. List active tests

`GET /api/tests` — public — HTTP `200`

Request body: none.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "slug", "name", "type", "version", "description"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "slug": { "type": "string" },
      "name": { "type": "string" },
      "type": { "enum": ["BIG_FIVE", "HEXACO", "CUSTOM"] },
      "version": { "type": "integer" },
      "description": { "type": ["string", "null"] }
    }
  }
}
```

An empty array means no active test definitions exist.

## 6. Get a test and its questions

`GET /api/tests/:slug` — public — HTTP `200`

Path parameter: `slug`, for example `big-five-v1`.

Request body: none.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    { "type": "null" },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "slug", "name", "type", "version", "description", "isActive", "createdAt", "questions"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "slug": { "type": "string" },
        "name": { "type": "string" },
        "type": { "enum": ["BIG_FIVE", "HEXACO", "CUSTOM"] },
        "version": { "type": "integer" },
        "description": { "type": ["string", "null"] },
        "isActive": { "type": "boolean" },
        "createdAt": { "type": "string", "format": "date-time" },
        "questions": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "code", "prompt", "kind", "position", "options", "minValue", "maxValue"],
            "properties": {
              "id": { "type": "string", "format": "uuid" },
              "code": { "type": "string" },
              "prompt": { "type": "string" },
              "kind": { "enum": ["LIKERT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN", "NUMBER", "TEXT"] },
              "position": { "type": "integer" },
              "options": { "type": ["array", "object", "string", "number", "boolean", "null"], "description": "Arbitrary JSON stored by the backend; seeded choice questions use an array of {value,label} objects." },
              "minValue": { "type": ["integer", "null"] },
              "maxValue": { "type": ["integer", "null"] }
            }
          }
        }
      }
    }
  ]
}
```

The service does not filter by `isActive` here. An unknown slug returns HTTP `200` with JSON `null`, not `404`.

## 7. Submit a completed test

`POST /api/tests/submissions` — currently public — HTTP `201`

The request must answer every question in the selected test definition exactly once. Values are numbers from 1 through 5 at DTO validation time and must also fall within each question's configured range. Scores are normalized to approximately `0..1` using the configured question weights and reverse scoring.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId", "testDefinitionId", "answers"],
  "properties": {
    "userId": { "type": "string", "format": "uuid" },
    "testDefinitionId": { "type": "string", "format": "uuid" },
    "answers": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["questionId", "value"],
        "properties": {
          "questionId": { "type": "string", "format": "uuid" },
          "value": { "type": "number", "minimum": 1, "maximum": 5 }
        }
      }
    }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "userId", "testDefinitionId", "completedAt", "createdAt", "traitScores"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "userId": { "type": "string", "format": "uuid" },
    "testDefinitionId": { "type": "string", "format": "uuid" },
    "completedAt": { "type": ["string", "null"], "format": "date-time" },
    "createdAt": { "type": "string", "format": "date-time" },
    "traitScores": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "attemptId", "trait", "score"],
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "attemptId": { "type": "string", "format": "uuid" },
          "trait": { "type": "string" },
          "score": { "type": "number" }
        }
      }
    }
  }
}
```

Errors: `400` validation failure, `"Every question must be answered exactly once"`, or `"Invalid answer for <question code>"`; `404` with `"Test not found"`. A nonexistent `userId` is not mapped to a stable 4xx response.

## 8. Connect an external integration identity

`POST /api/integrations/connect` — currently public — HTTP `201`

Creates or updates one integration per `(userId, provider)` and sets its status to `CONNECTED`. This records an identity only; it does not perform OAuth.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId", "provider"],
  "properties": {
    "userId": { "type": "string", "format": "uuid" },
    "provider": { "enum": ["SPOTIFY", "LETTERBOXD"] },
    "username": { "type": "string" }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "userId", "provider", "externalUserId", "username", "accessTokenEncrypted", "refreshTokenEncrypted", "tokenExpiresAt", "status", "lastSyncedAt", "metadata"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "userId": { "type": "string", "format": "uuid" },
    "provider": { "enum": ["SPOTIFY", "LETTERBOXD"] },
    "externalUserId": { "type": ["string", "null"] },
    "username": { "type": ["string", "null"] },
    "accessTokenEncrypted": { "type": ["string", "null"] },
    "refreshTokenEncrypted": { "type": ["string", "null"] },
    "tokenExpiresAt": { "type": ["string", "null"], "format": "date-time" },
    "status": { "enum": ["PENDING", "CONNECTED", "EXPIRED", "ERROR", "DISCONNECTED"] },
    "lastSyncedAt": { "type": ["string", "null"], "format": "date-time" },
    "metadata": { "type": ["object", "array", "string", "number", "boolean", "null"] }
  }
}
```

Important: the unfiltered model response can expose encrypted token fields if they are populated in the future. The frontend should ignore them; the backend should omit them.

## 9. Replace synced taste data

`POST /api/integrations/taste/sync` — currently public — HTTP `201`

Atomically deletes all existing taste items for this user/provider, inserts the supplied list, and updates the already-connected integration's `lastSyncedAt`. Omitted `artists` and `genres` default to `[]`; omitted `score` defaults to `1`. The integration must already exist, normally via endpoint 8.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId", "provider", "items"],
  "properties": {
    "userId": { "type": "string", "format": "uuid" },
    "provider": { "enum": ["SPOTIFY", "LETTERBOXD"] },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["externalId", "kind", "name"],
        "properties": {
          "externalId": { "type": "string" },
          "kind": { "type": "string", "description": "Provider-neutral category such as track, artist, film, or genre." },
          "name": { "type": "string" },
          "artists": { "type": "array", "items": { "type": "string" } },
          "genres": { "type": "array", "items": { "type": "string" } },
          "score": { "type": "number" }
        }
      }
    }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["synced"],
  "properties": { "synced": { "type": "integer", "minimum": 0 } }
}
```

There is no minimum item count, so `items: []` clears all items for that provider. Missing integrations and duplicate `(externalId, kind)` pairs are not currently mapped to stable 4xx errors.

## 9a. Connect and sync Letterboxd

`POST /api/integrations/letterboxd/connect` — currently public — HTTP `201`

Checks that `https://letterboxd.com/{username}/` is a public member profile, replaces the user's stored Letterboxd favorite films, and returns the data needed by the profile UI.

Request:

```json
{
  "userId": "00000000-0000-4000-8000-000000000000",
  "username": "letterboxd_username"
}
```

The response contains `provider`, `username`, `profileUrl`, `lastSyncedAt`, and a `favorites` array. Each favorite contains `externalId`, `title`, nullable `year`, nullable `posterUrl`, and `filmUrl`.

Errors: `400` for an invalid UUID or username, `404` when no public member profile is found, and `502` when Letterboxd cannot be reached or returns another error status.

## 9b. Get stored Letterboxd favorites

`GET /api/integrations/letterboxd/:userId/favorites` — currently public — HTTP `200`

Returns the same response shape as the connect endpoint from stored data without requesting Letterboxd. Returns `404` if the user has no connected Letterboxd integration.

## 10. Search for roommate matches

`POST /api/matches/search` — currently public — HTTP `201`

Hard filters require candidates to be discoverable, onboarded, in the same city (case-insensitive), use the same currency, and have overlapping budget ranges. `algorithms` optionally restricts which enabled strategies run. Omit it or pass `[]` to use all enabled strategies. A strategy is omitted for a pair when required data is missing; remaining weights are renormalized. Candidates for which no strategy can produce a score are omitted.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId"],
  "properties": {
    "userId": { "type": "string", "format": "uuid" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 },
    "algorithms": {
      "type": "array",
      "items": { "enum": ["PERSONALITY", "TASTE", "LIFESTYLE"] }
    }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "breakdown": {
      "type": "object",
      "additionalProperties": false,
      "required": ["key", "score", "weight", "version", "explanation"],
      "properties": {
        "key": { "enum": ["PERSONALITY", "TASTE", "LIFESTYLE"] },
        "score": { "type": "number", "minimum": 0, "maximum": 1 },
        "weight": { "type": "number", "minimum": 0 },
        "version": { "type": "string" },
        "explanation": {
          "oneOf": [
            {
              "title": "Personality explanation",
              "type": "object",
              "required": ["sharedTraits", "byTrait"],
              "properties": {
                "sharedTraits": { "type": "integer", "minimum": 1 },
                "byTrait": { "type": "object", "additionalProperties": { "type": "number", "minimum": 0, "maximum": 1 } }
              }
            },
            {
              "title": "Taste explanation",
              "type": "object",
              "required": ["sharedCount", "shared"],
              "properties": {
                "sharedCount": { "type": "integer", "minimum": 0 },
                "shared": { "type": "array", "maxItems": 12, "items": { "type": "string" } }
              }
            },
            {
              "title": "Lifestyle dimension explanation",
              "type": "object",
              "required": ["byDimension"],
              "properties": {
                "byDimension": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["cleanliness", "socialLevel", "sleepSchedule", "noiseTolerance", "guestsFrequency"],
                  "properties": {
                    "cleanliness": { "type": "number" },
                    "socialLevel": { "type": "number" },
                    "sleepSchedule": { "type": "number" },
                    "noiseTolerance": { "type": "number" },
                    "guestsFrequency": { "type": "number" }
                  }
                }
              }
            },
            {
              "title": "Lifestyle conflict explanation",
              "type": "object",
              "required": ["conflict"],
              "properties": { "conflict": { "enum": ["pets", "smoking"] } }
            }
          ]
        }
      }
    }
  },
  "type": "object",
  "additionalProperties": false,
  "required": ["runId", "matches"],
  "properties": {
    "runId": { "type": "string", "format": "uuid" },
    "matches": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["rank", "score", "user", "breakdown"],
        "properties": {
          "rank": { "type": "integer", "minimum": 1 },
          "score": { "type": "number", "minimum": 0, "maximum": 1 },
          "user": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "displayName", "avatarUrl", "bio"],
            "properties": {
              "id": { "type": "string", "format": "uuid" },
              "displayName": { "type": ["string", "null"] },
              "avatarUrl": { "type": ["string", "null"] },
              "bio": { "type": ["string", "null"] }
            }
          },
          "breakdown": { "type": "array", "items": { "$ref": "#/$defs/breakdown" } }
        }
      }
    }
  }
}
```

`score` is the weighted mean of the available strategy scores. A pets conflict produces lifestyle score `0`; a smoking preference mismatch produces `0.2`. A successful search can return `matches: []` and still creates a completed match run. Errors: `404` with `"User or housing preference not found"`.

## Admin endpoints

Every endpoint in this section requires a valid JWT whose `role` claim is `ADMIN`.

- Missing, invalid, or expired token: `401`.
- Valid non-admin token: `403`.

## 11. Admin algorithm control page

`GET /admin` — admin only — HTTP `200`

This is the only route not under `/api`. It returns an HTML document (`Content-Type: text/html; charset=utf-8`), not JSON. It provides a small page for loading and editing algorithm weights with an admin JWT.

Request body: none. Response body: arbitrary HTML string/document; there is no JSON schema.

## 12. List algorithm configurations

`GET /api/admin/algorithms` — admin only — HTTP `200`

Request body: none.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "key", "enabled", "weight", "version", "settings", "updatedAt"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "key": { "enum": ["PERSONALITY", "TASTE", "LIFESTYLE"] },
      "enabled": { "type": "boolean" },
      "weight": { "type": "number" },
      "version": { "type": "string" },
      "settings": { "type": ["object", "array", "string", "number", "boolean", "null"] },
      "updatedAt": { "type": "string", "format": "date-time" }
    }
  }
}
```

Results are sorted by `key` ascending.

## 13. Update or create an algorithm configuration

`PATCH /api/admin/algorithms/:key` — admin only — HTTP `200`

Path parameter: `key` must be `PERSONALITY`, `TASTE`, or `LIFESTYLE`. The controller does not runtime-validate this parameter, so the frontend must only send one of those values.

All request properties are optional. For a missing database row, omitted values default to `enabled: true`, `weight: 1`, `version: "1.0.0"`, and `settings: {}`. For an existing row, omitted properties remain unchanged.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enabled": { "type": "boolean" },
    "weight": { "type": "number", "minimum": 0, "maximum": 100 },
    "version": { "type": "string" },
    "settings": { "type": "object", "additionalProperties": true }
  }
}
```

Response schema: one algorithm configuration object using the item schema from endpoint 12.

## 14. Bulk-create questions for a test

`POST /api/admin/tests/:testDefinitionId/questions` — admin only — HTTP `201`

Path parameter: `testDefinitionId` is intended to be a test definition UUID but is not controller-validated. All questions are created in one transaction, so any error rolls back the entire batch. Each code and each position must be unique within the test.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "questionInput": {
      "type": "object",
      "additionalProperties": false,
      "required": ["code", "prompt", "trait", "position"],
      "properties": {
        "code": { "type": "string", "minLength": 1, "maxLength": 50 },
        "prompt": { "type": "string", "minLength": 1, "maxLength": 1000 },
        "kind": { "enum": ["LIKERT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN", "NUMBER", "TEXT"], "default": "LIKERT" },
        "trait": { "type": "string", "minLength": 1, "maxLength": 100 },
        "reverseScored": { "type": "boolean", "default": false },
        "position": { "type": "integer", "minimum": 1 },
        "options": { "type": "array", "items": {} },
        "minValue": { "type": "integer" },
        "maxValue": { "type": "integer" },
        "weight": { "type": "number", "minimum": 0, "default": 1 }
      }
    }
  },
  "type": "object",
  "additionalProperties": false,
  "required": ["questions"],
  "properties": {
    "questions": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/questionInput" } }
  }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "testDefinitionId", "code", "prompt", "kind", "trait", "reverseScored", "position", "options", "minValue", "maxValue", "weight"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "testDefinitionId": { "type": "string", "format": "uuid" },
      "code": { "type": "string" },
      "prompt": { "type": "string" },
      "kind": { "enum": ["LIKERT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN", "NUMBER", "TEXT"] },
      "trait": { "type": "string" },
      "reverseScored": { "type": "boolean" },
      "position": { "type": "integer" },
      "options": { "type": ["array", "object", "string", "number", "boolean", "null"] },
      "minValue": { "type": ["integer", "null"] },
      "maxValue": { "type": ["integer", "null"] },
      "weight": { "type": "number" }
    }
  }
}
```

Errors: `400` validation failure or `"minValue cannot exceed maxValue"`; `404` with `"Test definition not found"`; `409` with `"Question code and position must be unique within a test"` (the text uses “and” even when only one constraint conflicts).

## 15. Update one question

`PATCH /api/admin/questions/:id` — admin only — HTTP `200`

Path parameter: `id` is intended to be a question UUID but is not controller-validated. Every body property is optional; omitted properties remain unchanged.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "code": { "type": "string", "minLength": 1, "maxLength": 50 },
    "prompt": { "type": "string", "minLength": 1, "maxLength": 1000 },
    "kind": { "enum": ["LIKERT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN", "NUMBER", "TEXT"] },
    "trait": { "type": "string", "minLength": 1, "maxLength": 100 },
    "reverseScored": { "type": "boolean" },
    "position": { "type": "integer", "minimum": 1 },
    "options": { "type": "array", "items": {} },
    "minValue": { "type": "integer" },
    "maxValue": { "type": "integer" },
    "weight": { "type": "number", "minimum": 0 }
  }
}
```

Response schema: one full question object using the item schema from endpoint 14.

Errors: `400` validation failure or `"minValue cannot exceed maxValue"`; `404` with `"Question not found"`; `409` with `"Question code and position must be unique within a test"`.

## 16. Change a user's role

`PATCH /api/admin/users/:id/role` — admin only — HTTP `200`

Path parameter: `id` is intended to be a user UUID but is not controller-validated. This can grant or revoke admin access.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["role"],
  "properties": { "role": { "enum": ["USER", "ADMIN"] } }
}
```

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "email", "displayName", "role"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "displayName": { "type": ["string", "null"] },
    "role": { "enum": ["USER", "ADMIN"] }
  }
}
```

Errors: `400` validation failure; `404` with `"User not found"`. Role changes do not invalidate already-issued JWTs.

## Frontend integration notes

- Check `response.ok` before parsing a response as a success model. Error bodies use the common error shape above.
- Do not send numeric input values as strings. Runtime implicit numeric conversion is not enabled, so values such as `"20"` fail integer/number validation.
- Preserve enum casing exactly as documented.
- Treat `GET /api/users/:id` and `GET /api/tests/:slug` as nullable success responses.
- The backend does not currently expose endpoints to update `avatarUrl` or `isDiscoverable`, list match history, disconnect integrations, or retrieve submitted test attempts.
- The response leaks called out above are backend defects, not fields the frontend should depend on.
