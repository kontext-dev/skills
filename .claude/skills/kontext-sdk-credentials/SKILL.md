---
name: kontext-sdk-credentials
description: Retrieve the integration credential available to a platform user from a confidential Kontext application. Use when asked to fetch GitHub, Google, or other integration tokens from the server side with clientId, clientSecret, and userId, verify whether a user has already connected an integration, or retrieve an admin-managed shared server token through the same SDK flow. Do not use this skill to configure Bring your own auth or create hosted connect sessions.
---

# Kontext Server Credential Retrieval

Use this skill to retrieve the integration credential available to a known user from a **confidential** Kontext application.

This skill only covers **retrieval**:
- verify the application can authenticate as a confidential client
- fetch the credential for a specific integration and platform user ID
- handle both per-user credentials and admin-managed shared server tokens
- explain clearly whether the next action belongs to the user or an admin

This skill does **not** cover:
- configuring Bring your own auth
- creating or rotating the BYOA API key
- creating hosted connect sessions

If the user needs setup, use `kontext-byoa-setup` first.

## What this feature is

The same server-side retrieval call can return two different credential models:
- a user-managed credential the user connected earlier, for example OAuth or user API key
- an admin-managed shared server token that is already available to every end user of the attached app

The backend retrieves that credential with:
- the app's **OAuth Client ID**
- the app's **OAuth Client Secret**
- the platform's own stable **userId**

In normal app code, this is:

```ts
const credential = await kontext.require("github", {
  userId: "platform-user-123",
});
```

What changes with shared server tokens:
- end users do not connect anything for that integration
- the same `kontext.require(...)` call returns the shared token directly
- `expires_in` may be omitted, which is expected for shared admin-managed tokens

This skill focuses on the retrieval step only.

## Required inputs

Read these from the environment:
- `KONTEXT_API_BASE_URL` (optional, defaults to `https://api.kontext.dev`)
- `KONTEXT_CLIENT_ID`
- `KONTEXT_CLIENT_SECRET`
- `KONTEXT_INTEGRATION`
- `PLATFORM_USER_ID`

Optional:
- `KONTEXT_SHOW_TOKEN=true`

## Secret handling rules

Follow these rules strictly:

- Never print `KONTEXT_CLIENT_SECRET` unless the user explicitly asks.
- Never write client secrets or returned access tokens to tracked files.
- Never commit secrets or live tokens.
- By default, do not print the full retrieved access token unless the user explicitly asks for it or the command is being piped directly into another local process.
- If retrieval fails because the user has not connected the integration yet, explain that plainly instead of retrying blindly.
- If retrieval fails because the shared server token is missing or broken, say that an admin must update the integration configuration.

## Workflow

1. Validate the required environment variables are present.
2. Run the bundled helper script:

```bash
node scripts/require-credential.mjs
```

3. If the helper reports that the integration is not connected:
   - for user-managed integrations, tell the user the platform user still needs to connect that integration first
   - if the integration is supposed to use a shared server token, tell the user to verify the platform user exists in the app and that the integration is attached
   - do not mix in BYOA setup unless they ask
4. If the helper reports that the shared server token is misconfigured:
   - tell the user an admin needs to update the shared server token
   - do not mix in BYOA setup unless they ask
5. Summarize the result.

## Preferred command pattern

```bash
KONTEXT_API_BASE_URL=http://localhost:4000 \
KONTEXT_CLIENT_ID=app_... \
KONTEXT_CLIENT_SECRET=app_secret_... \
KONTEXT_INTEGRATION=github \
PLATFORM_USER_ID=platform-user-123 \
node scripts/require-credential.mjs
```

If the raw token is explicitly needed:

```bash
KONTEXT_SHOW_TOKEN=true node scripts/require-credential.mjs --json
```

## Notes for the agent

- Use straightforward language.
- In user-facing text, call `PLATFORM_USER_ID` the platform's own user ID.
- Do not tell the user to store a Kontext internal user ID.
- If retrieval fails with an `integration_required` style error, do not assume it is always a user-connect problem. Shared-token integrations can also fail here when the app does not know that platform user yet.
- If retrieval fails with an `invalid_target` error mentioning the shared server token, tell the user this is an admin configuration issue, not an end-user action.
- Do not drift into BYOA setup in this skill.

## Success output

Return a short summary in this shape:

Credential retrieved.

Application auth:
- OAuth Client ID: <client id>

Request:
- Integration: <integration>
- Platform user ID: <user id>

Result:
- Token type: <type>
- Expires in: <seconds or not provided>
- Notes: <only include when `expires_in` is not provided; mention that this can happen for admin-managed shared tokens>

Only show the raw access token if the user explicitly asked for it.
