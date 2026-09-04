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

Email verification and login return a JWT. Signup only sends a verification code. For protected endpoints send:

```http
Authorization: Bearer <accessToken>
```

Admin, messaging, and profile-image update endpoints are protected in the current implementation. The general profile, user lookup, test submission, integration, and matching endpoints currently trust the `userId`/`id` supplied by the client and do **not** verify a JWT. This is unsafe for production and frontend code should not assume it will remain that way.

The JWT payload contains `sub` (user ID), `email`, `role`, `iat`, and `exp`. The default lifetime is 7 days unless `JWT_EXPIRES_IN` is configured differently. A user whose role changes must log in again to get a token with the new role.

## Common enums

```json
{
  "UserRole": ["USER", "ADMIN"],
  "Gender": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"],
  "TestType": ["BIG_FIVE", "HEXACO", "CUSTOM"],
  "QuestionKind": [
    "LIKERT",
    "SINGLE_CHOICE",
    "MULTIPLE_CHOICE",
    "BOOLEAN",
    "NUMBER",
    "TEXT"
  ],
  "IntegrationProvider": ["SPOTIFY", "LETTERBOXD"],
  "IntegrationStatus": [
    "PENDING",
    "CONNECTED",
    "EXPIRED",
    "ERROR",
    "DISCONNECTED"
  ],
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

Creates an unverified user, normalizes the email by trimming and lowercasing it, trims `displayName`, stores a bcrypt hash of a six-digit verification code, and sends the code through Resend. Codes expire after 10 minutes.

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
  "required": ["message", "email", "expiresInSeconds"],
  "properties": {
    "message": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "expiresInSeconds": { "const": 600 }
  }
}
```

Errors: `400` validation failure; `409` for an existing or pending account; `503` when Resend is unavailable. A pending account can use the resend endpoint.

## 1a. Verify signup email

`POST /api/auth/verify-email` — public — HTTP `200`

Request: `{ "email": "person@example.com", "code": "123456" }`. A valid code marks the email verified, consumes the code, and returns `{ accessToken, tokenType, user }`. The user object contains `id`, `email`, `displayName`, and `role`. A code permits at most five failed attempts. Invalid, expired, already-used, and unknown-account codes all return `400` with `"Invalid or expired verification code"`.

## 1b. Resend signup verification

`POST /api/auth/resend-verification` — public — HTTP `200`

Request: `{ "email": "person@example.com" }`. For a pending account, this replaces the old code and emails a fresh one. Requests are limited to one send per minute. The response is deliberately identical for unknown, verified, rate-limited, and pending accounts so the endpoint does not disclose account status.

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

Response schema: `{ accessToken, tokenType, user }`, identical to the successful email-verification response. Once verified, future logins never require another email code.

Errors: `400` validation failure; `401` with `"Invalid email or password"`; `403` with `"Email verification is required"` only after the correct password is supplied for a pending account. For a pending account, login also sends a new verification code unless one was sent during the previous 60 seconds. The `403` response includes `code: "EMAIL_VERIFICATION_REQUIRED"` and `verificationEmailSent`, which tells the client whether a new email was sent.

## 3. Create or update a user's profile

`PUT /api/users/profile` — currently public — HTTP `200`

Creates the user and both related profiles when the supplied `id` does not exist, or updates them when it does. It marks onboarding complete. `countryCode` and `currency` are uppercased. Budget values are integer currency units, not cents. Optional `lookingFor` accepts `male`, `female`, or `all`; omitted values default to `all` for new users and preserve the stored value on updates.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "email",
    "displayName",
    "city",
    "countryCode",
    "minMonthlyBudget",
    "maxMonthlyBudget",
    "currency",
    "cleanliness",
    "socialLevel",
    "sleepSchedule",
    "noiseTolerance",
    "guestsFrequency",
    "smokingAllowed",
    "petsAllowed",
    "hasPets"
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
    "gender": {
      "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"]
    },
    "lookingFor": { "enum": ["male", "female", "all"], "default": "all" },
    "bio": { "type": "string", "maxLength": 1000 },
    "city": { "type": "string", "minLength": 1, "maxLength": 100 },
    "countryCode": {
      "type": "string",
      "minLength": 2,
      "maxLength": 2,
      "description": "Use an ISO 3166-1 alpha-2 code."
    },
    "minMonthlyBudget": { "type": "integer", "minimum": 0 },
    "maxMonthlyBudget": { "type": "integer", "minimum": 1 },
    "currency": {
      "type": "string",
      "minLength": 3,
      "maxLength": 3,
      "description": "Use an ISO 4217 currency code."
    },
    "moveInDate": {
      "oneOf": [
        { "type": "string", "format": "date" },
        { "type": "string", "format": "date-time" }
      ],
      "description": "Optional legacy field. ISO date or date-time; omitted values are accepted and existing stored values are preserved. This field is not used by matching."
    },
    "preferredAreas": { "type": "array", "items": { "type": "string" } },
    "preferredRoommateGenders": {
      "type": "array",
      "default": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"],
      "items": {
        "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"]
      }
    },
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
      "required": [
        "id",
        "userId",
        "city",
        "countryCode",
        "minMonthlyBudget",
        "maxMonthlyBudget",
        "currency",
        "moveInDate",
        "preferredAreas",
        "preferredRoommateGenders"
      ],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "userId": { "type": "string", "format": "uuid" },
        "city": { "type": "string" },
        "countryCode": { "type": "string" },
        "minMonthlyBudget": { "type": "integer" },
        "maxMonthlyBudget": { "type": "integer" },
        "currency": { "type": "string" },
        "moveInDate": { "type": ["string", "null"], "format": "date-time" },
        "preferredAreas": { "type": "array", "items": { "type": "string" } },
        "preferredRoommateGenders": {
          "type": "array",
          "items": {
            "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"]
          }
        }
      }
    },
    "lifestyle": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "userId",
        "cleanliness",
        "socialLevel",
        "sleepSchedule",
        "noiseTolerance",
        "guestsFrequency",
        "smokingAllowed",
        "petsAllowed",
        "hasPets"
      ],
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
  "required": [
    "id",
    "email",
    "passwordHash",
    "role",
    "displayName",
    "birthDate",
    "gender",
    "lookingFor",
    "bio",
    "avatarUrl",
    "isDiscoverable",
    "onboardingComplete",
    "createdAt",
    "updatedAt",
    "housingPreference",
    "lifestyleProfile"
  ],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "passwordHash": { "type": ["string", "null"] },
    "role": { "enum": ["USER", "ADMIN"] },
    "displayName": { "type": ["string", "null"] },
    "birthDate": { "type": ["string", "null"], "format": "date-time" },
    "gender": {
      "oneOf": [
        {
          "enum": ["WOMAN", "MAN", "NON_BINARY", "OTHER", "PREFER_NOT_TO_SAY"]
        },
        { "type": "null" }
      ]
    },
    "lookingFor": { "enum": ["male", "female", "all"] },
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

## 3a. Update a user's profile image

`PATCH /api/users/me/avatar` — bearer JWT required — HTTP `200`

Stores an externally hosted HTTP(S) image URL in the user's existing `avatarUrl` field. This endpoint does not upload or host image files. Send `null` to remove the current profile image.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["avatarUrl"],
  "properties": {
    "avatarUrl": {
      "type": ["string", "null"],
      "format": "uri",
      "maxLength": 2048,
      "description": "An absolute HTTP or HTTPS URL, or null to clear the image."
    }
  }
}
```

Example response:

```json
{
  "id": "59b247da-1479-45c1-9c11-6493b63eea4f",
  "avatarUrl": "https://images.example.com/profile.jpg"
}
```

Errors: `400` for a missing `avatarUrl` or a URL that is not HTTP(S); `401` for a missing or invalid JWT; `404` with `"User not found"` when the authenticated user no longer exists.

### Get the authenticated user's private profile

`GET /api/users/me` — JWT required — HTTP `200`

The user is derived from the JWT; no user ID or request body is accepted. The response is the private application profile used for onboarding and account screens. It includes `email`, `role`, `birthDate`, `isDiscoverable`, `onboardingComplete`, timestamps, housing/lifestyle records, and safe integration summaries. It never includes `passwordHash`, verification codes, or integration tokens.

Errors: `401` for a missing or invalid JWT; `404` with `"User not found"` when the token's user no longer exists.

## 4. Get a user and profile

`GET /api/users/:id` — JWT required — HTTP `200`

Path parameter: `id` must be a UUID.

Request body: none.

The response contains only public identity fields, calculated `age` (never the exact birth date), housing and lifestyle preferences, the latest completed personality test and trait scores, and manual/imported tastes. It never contains email, password hash, role, integration credentials, or timestamps from the user record.

Other users are visible only when discoverable, fully onboarded, and their `lookingFor` audience permits the viewer's gender. `female` permits viewers whose gender is `WOMAN`, `male` permits `MAN`, and `all` permits every gender. A block in either direction makes the profile unavailable and also removes that pair from matching. Missing, private, audience-restricted, and blocked profiles all return `404` with `"Profile not found"` to avoid revealing account or restriction state. Invalid IDs return `400`; a missing or invalid token returns `401`.

### Profile blocking

All routes require a JWT and derive the acting user from it.

- `POST /api/users/:id/block` creates a block and is idempotent. Self-blocking returns `400`; an unknown target returns `404`.
- `DELETE /api/users/:id/block` removes the current user's block. It returns `{ "blockedId": "<uuid>", "unblocked": true }`; `unblocked` is `false` when no block existed.
- `GET /api/users/me/blocks` lists the current user's blocks newest-first, with `createdAt` and safe `id`, `displayName`, and `avatarUrl` fields for each blocked user.

Representative profile response:

```json
{
  "id": "59b247da-1479-45c1-9c11-6493b63eea4f",
  "displayName": "Taylor",
  "gender": "NON_BINARY",
  "bio": "Quiet on weekdays, social on weekends.",
  "avatarUrl": "https://images.example.com/profile.jpg",
  "housingPreference": { "city": "Berlin", "countryCode": "DE" },
  "lifestyleProfile": { "cleanliness": 4, "socialLevel": 3 },
  "age": 26,
  "personality": {
    "test": {
      "slug": "big-five",
      "name": "Big Five",
      "type": "BIG_FIVE",
      "version": 1
    },
    "completedAt": "2026-08-30T12:00:00.000Z",
    "traits": [{ "trait": "openness", "score": 0.82 }]
  },
  "tastes": {
    "musicGenres": [{ "id": "<uuid>", "name": "Jazz" }],
    "favoriteArtists": [],
    "movieGenres": [],
    "favoriteMovies": [],
    "importedItems": []
  }
}
```

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

The seeded response contains both `big-five-v1` (short, 10 items) and
`big-five-v2` (long, 50 items), ordered by version so the frontend can let the
user choose. Both definitions accept new submissions.

## 6. Get a test and its questions

`GET /api/tests/:slug` — public — HTTP `200`

Path parameter: `slug`, for example `big-five-v1` (short) or `big-five-v2` (long).

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
      "required": [
        "id",
        "slug",
        "name",
        "type",
        "version",
        "description",
        "isActive",
        "createdAt",
        "questions"
      ],
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
            "required": [
              "id",
              "code",
              "prompt",
              "kind",
              "position",
              "options",
              "minValue",
              "maxValue"
            ],
            "properties": {
              "id": { "type": "string", "format": "uuid" },
              "code": { "type": "string" },
              "prompt": { "type": "string" },
              "kind": {
                "enum": [
                  "LIKERT",
                  "SINGLE_CHOICE",
                  "MULTIPLE_CHOICE",
                  "BOOLEAN",
                  "NUMBER",
                  "TEXT"
                ]
              },
              "position": { "type": "integer" },
              "options": {
                "type": [
                  "array",
                  "object",
                  "string",
                  "number",
                  "boolean",
                  "null"
                ],
                "description": "Arbitrary JSON stored by the backend; seeded choice questions use an array of {value,label} objects."
              },
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

The request must target an active test definition and answer every question in it exactly once. Values are numbers from 1 through 5 at DTO validation time and must also fall within each question's configured range. Scores are normalized to `0..1` using the configured question weights and reverse scoring. Every submission is retained. A user who completed the short version can later submit the long version; that newer attempt and its newly calculated trait scores become the result used by profiles and matching.

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
  "required": [
    "id",
    "userId",
    "testDefinitionId",
    "completedAt",
    "createdAt",
    "traitScores"
  ],
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
  "required": [
    "id",
    "userId",
    "provider",
    "externalUserId",
    "username",
    "accessTokenEncrypted",
    "refreshTokenEncrypted",
    "tokenExpiresAt",
    "status",
    "lastSyncedAt",
    "metadata"
  ],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "userId": { "type": "string", "format": "uuid" },
    "provider": { "enum": ["SPOTIFY", "LETTERBOXD"] },
    "externalUserId": { "type": ["string", "null"] },
    "username": { "type": ["string", "null"] },
    "accessTokenEncrypted": { "type": ["string", "null"] },
    "refreshTokenEncrypted": { "type": ["string", "null"] },
    "tokenExpiresAt": { "type": ["string", "null"], "format": "date-time" },
    "status": {
      "enum": ["PENDING", "CONNECTED", "EXPIRED", "ERROR", "DISCONNECTED"]
    },
    "lastSyncedAt": { "type": ["string", "null"], "format": "date-time" },
    "metadata": {
      "type": ["object", "array", "string", "number", "boolean", "null"]
    }
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
          "kind": {
            "type": "string",
            "description": "Provider-neutral category such as track, artist, film, or genre."
          },
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

Results are calculated from current profile data for every request and are not persisted. Hard filters require candidates to be discoverable, onboarded, in the same country and city (city is case-insensitive), use the same currency, and satisfy both users' roommate-gender preferences and `lookingFor` audience choices. Budget-range compatibility is a strongly weighted score rather than a hard filter, so a candidate with a non-overlapping range remains eligible but ranks lower. These restrictions are applied in the candidate database query before scoring. Stored move-in dates are ignored.

After hard filtering, a cheap budget/lifestyle score selects at most 50 candidates. Personality and taste algorithms run only for that shortlist, and at most 20 results are returned. Budget is always included in the final score with weight `2`; its breakdown key is `BUDGET`. `algorithms` optionally restricts which configurable strategies run. Omit it or pass `[]` to use all enabled strategies. A configurable strategy is omitted for a pair when required data is missing; remaining weights are renormalized.

Request schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId"],
  "properties": {
    "userId": { "type": "string", "format": "uuid" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 20, "default": 20 },
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
        "key": { "enum": ["BUDGET", "PERSONALITY", "TASTE", "LIFESTYLE"] },
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
                "byTrait": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  }
                },
                "traitWeights": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "number",
                    "minimum": 0
                  }
                },
                "traitModels": {
                  "type": "object",
                  "additionalProperties": {
                    "enum": ["similarity", "low-stress", "cooperative"]
                  }
                }
              }
            },
            {
              "title": "Taste explanation",
              "type": "object",
              "required": ["sharedCount", "shared"],
              "properties": {
                "sharedCount": { "type": "integer", "minimum": 0 },
                "shared": {
                  "type": "array",
                  "maxItems": 12,
                  "items": { "type": "string" }
                }
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
                  "required": [
                    "cleanliness",
                    "socialLevel",
                    "sleepSchedule",
                    "noiseTolerance",
                    "guestsFrequency"
                  ],
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
  "required": ["matches"],
  "properties": {
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
          "breakdown": {
            "type": "array",
            "items": { "$ref": "#/$defs/breakdown" }
          }
        }
      }
    }
  }
}
```

`score` is the weighted mean of budget compatibility and the available configurable strategy scores. Budget has a fixed weight of `2`; a non-overlapping range scores `0` but does not remove the candidate. A pets conflict produces lifestyle score `0`; a smoking preference mismatch produces `0.2`. A successful search can return `matches: []`; it does not create database records. Errors: `404` with `"User or housing preference not found"`.

Personality v2 uses trait-dependent compatibility. Conscientiousness,
extraversion, and openness use score similarity. Neuroticism primarily
penalizes the pair's average level and applies a smaller mismatch penalty.
Agreeableness blends the pair's average level with similarity. Default trait
weights are `0.30`, `0.25`, `0.20`, `0.15`, and `0.10` for conscientiousness,
neuroticism, agreeableness, extraversion, and openness. Admins may override
them with the non-negative algorithm settings `conscientiousnessWeight`,
`neuroticismWeight`, `agreeablenessWeight`, `extraversionWeight`, and
`opennessWeight`; zero disables that trait and available weights are
renormalized.

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
    "required": [
      "id",
      "key",
      "enabled",
      "weight",
      "version",
      "settings",
      "updatedAt"
    ],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "key": { "enum": ["PERSONALITY", "TASTE", "LIFESTYLE"] },
      "enabled": { "type": "boolean" },
      "weight": { "type": "number" },
      "version": { "type": "string" },
      "settings": {
        "type": ["object", "array", "string", "number", "boolean", "null"]
      },
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
        "kind": {
          "enum": [
            "LIKERT",
            "SINGLE_CHOICE",
            "MULTIPLE_CHOICE",
            "BOOLEAN",
            "NUMBER",
            "TEXT"
          ],
          "default": "LIKERT"
        },
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
    "questions": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/questionInput" }
    }
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
    "required": [
      "id",
      "testDefinitionId",
      "code",
      "prompt",
      "kind",
      "trait",
      "reverseScored",
      "position",
      "options",
      "minValue",
      "maxValue",
      "weight"
    ],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "testDefinitionId": { "type": "string", "format": "uuid" },
      "code": { "type": "string" },
      "prompt": { "type": "string" },
      "kind": {
        "enum": [
          "LIKERT",
          "SINGLE_CHOICE",
          "MULTIPLE_CHOICE",
          "BOOLEAN",
          "NUMBER",
          "TEXT"
        ]
      },
      "trait": { "type": "string" },
      "reverseScored": { "type": "boolean" },
      "position": { "type": "integer" },
      "options": {
        "type": ["array", "object", "string", "number", "boolean", "null"]
      },
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
    "kind": {
      "enum": [
        "LIKERT",
        "SINGLE_CHOICE",
        "MULTIPLE_CHOICE",
        "BOOLEAN",
        "NUMBER",
        "TEXT"
      ]
    },
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

## 17. List users for administration

`GET /api/admin/users` — admin only — HTTP `200`

Returns the minimal user data needed to choose a user for an ID-based admin operation. Results are sorted by `displayName` ascending and then by `id`; users without a display name appear last.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "displayName"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "displayName": { "type": ["string", "null"] }
    }
  }
}
```

## 18. Filter users by completed personality tests

`GET /api/admin/users/by-test-status/:status` — admin only — HTTP `200`

Path parameter `status` accepts exactly one of:

- `SHORT_ONLY`: completed the short test and has not completed the long test.
- `LONG_ONLY`: completed the long test and has not completed the short test.
- `BOTH`: completed both the short and long tests.

Only attempts with a non-null `completedAt` value count. Request body: none.
Results are sorted by `displayName` ascending and then by `id`; users without a
display name appear last.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["id", "displayName", "email"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "displayName": { "type": ["string", "null"] },
      "email": { "type": "string", "format": "email" }
    }
  }
}
```

Example response:

```json
[
  {
    "id": "00000000-0000-4000-8000-000000000001",
    "displayName": "Alex",
    "email": "alex@example.com"
  }
]
```

An empty array means no users match the selected status. Errors: `400` for an
unsupported or incorrectly-cased status; `401` for missing or invalid
authentication; `403` for a non-admin user.

## 19. Get a user's test and taste completion status

`GET /api/admin/users/:id/completion-status` — admin only — HTTP `200`

Path parameter: `id` must be a user UUID. Request body: none. Only completed
test attempts are considered. Repeated completions do not change the status.
Taste selection is true when the user has at least one manual catalog selection
or imported taste item.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["userId", "personalityTests", "tastes"],
  "properties": {
    "userId": { "type": "string", "format": "uuid" },
    "personalityTests": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status", "completedShort", "completedLong"],
      "properties": {
        "status": {
          "enum": ["NONE", "SHORT_ONLY", "LONG_ONLY", "BOTH"]
        },
        "completedShort": { "type": "boolean" },
        "completedLong": { "type": "boolean" }
      }
    },
    "tastes": {
      "type": "object",
      "additionalProperties": false,
      "required": ["selected", "counts"],
      "properties": {
        "selected": { "type": "boolean" },
        "counts": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "musicGenres",
            "favoriteArtists",
            "movieGenres",
            "favoriteMovies",
            "importedItems"
          ],
          "properties": {
            "musicGenres": { "type": "integer", "minimum": 0 },
            "favoriteArtists": { "type": "integer", "minimum": 0 },
            "movieGenres": { "type": "integer", "minimum": 0 },
            "favoriteMovies": { "type": "integer", "minimum": 0 },
            "importedItems": { "type": "integer", "minimum": 0 }
          }
        }
      }
    }
  }
}
```

Example response:

```json
{
  "userId": "00000000-0000-4000-8000-000000000001",
  "personalityTests": {
    "status": "BOTH",
    "completedShort": true,
    "completedLong": true
  },
  "tastes": {
    "selected": true,
    "counts": {
      "musicGenres": 3,
      "favoriteArtists": 2,
      "movieGenres": 4,
      "favoriteMovies": 1,
      "importedItems": 0
    }
  }
}
```

Errors: `400` when `id` is not a UUID; `401` for missing or invalid
authentication; `403` for a non-admin user; `404` with `"User not found"` when
the user does not exist.

## 20. Delete a user

`DELETE /api/admin/users/:id` — admin only — HTTP `200`

Path parameter: `id` must be a user UUID. Deleting the user also deletes their profile, preferences, verification code, test attempts and results, integrations, taste selections, blocks, conversations, and messages through database-enforced cascading foreign keys. Shared catalog records such as artists, genres, and movies are retained.

Response schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "email", "deleted"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "deleted": { "const": true }
  }
}
```

Errors: `400` when `id` is not a UUID; `404` with `"User not found"` when no user has that ID. The client should discard any token belonging to the deleted user; existing JWTs are stateless and remain cryptographically valid until they expire.

## Messaging API

All messaging endpoints require `Authorization: Bearer <accessToken>` and derive the user ID from that token.

- `POST /api/messages/conversations` with `{ "recipientId": "<uuid>" }` gets or creates the unique direct conversation when the recipient's current `lookingFor` choice permits the sender's gender.
- `GET /api/messages/conversations` lists conversations, participants, the latest message, and unread counts.
- `GET /api/messages/conversations/:id?limit=50&cursor=<messageUuid>` returns newest-first `{ items, nextCursor }` history.
- `POST /api/messages/conversations/:id` with `{ "body": "Hello" }` rechecks the recipient's current `lookingFor` choice, then stores the message and broadcasts `message:new`. A disallowed sender receives `403` even when the conversation already exists.
- `PATCH /api/messages/conversations/:id/read` marks unread messages from the other participant as read and broadcasts `conversation:read`.
- `DELETE /api/admin/messages` requires an admin JWT and deletes all messages while retaining empty conversations.

Socket.IO uses the `/chat` namespace and WebSocket-only transport. The authenticated application shell should connect with `auth: { token: accessToken }` while the website is open, regardless of the current page, and disconnect on logout/unmount. Supported client events are `message:send` and `conversation:read`; emitted server events are `realtime:ready`, `message:new`, `conversation:read`, and `realtime:error`. Transport ping/pong automatically removes dead sessions, and offline users have no server-side socket.

## Frontend integration notes

- Check `response.ok` before parsing a response as a success model. Error bodies use the common error shape above.
- Do not send numeric input values as strings. Runtime implicit numeric conversion is not enabled, so values such as `"20"` fail integer/number validation.
- Preserve enum casing exactly as documented.
- Treat `GET /api/tests/:slug` as a nullable success response. User profile lookup returns `404` when unavailable.
- The backend does not currently expose endpoints to update `isDiscoverable`, list match history, disconnect integrations, or retrieve submitted test attempts.
