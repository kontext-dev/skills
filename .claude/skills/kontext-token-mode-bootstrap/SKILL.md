---
name: kontext-token-mode-bootstrap
description: Bootstrap a public Kontext application for token-mode runtime credential exchange via the Management API using a service account. Use when replacing hardcoded end-user API tokens with `kontext.requireProvider(providerHandle, token)`, creating or reusing a public PKCE app, ensuring and attaching a user-chosen provider, and optionally writing the public client ID into a local env file. Do not use this skill for confidential `userId` retrieval or Bring your own auth.
---

# Kontext Token Mode Bootstrap

Use this skill when the app should keep user credentials at runtime and stop relying on hardcoded provider tokens in source code or env.

This skill covers one path:
- bootstrap or reuse a **public** Kontext application with PKCE
- ensure or update a provider chosen by the caller
- attach that provider to the public app
- optionally write the **public client ID only** into a local env file
- rewrite runtime code to use token mode:

```ts
const credential = await kontext.requireProvider(providerHandle, token);
```

This skill does **not** cover:
- confidential `kontext.requireProvider(providerHandle, { userId })` retrieval
- Bring your own auth, issuer, JWKS, or partner connect bootstrap
- hardcoding a provider recipe like Gmail into the skill itself

If the request is about confidential backend retrieval with `userId`, use `kontext-sdk-credentials` instead.
If the request is about trusting the app's own auth system and avoiding double auth, use `kontext-byoa-setup` instead.

## Runtime Shape

Use this flow:

1. Admin or setup agent runs the bundled bootstrap script with a service account.
2. The script creates or reuses a **public** app with PKCE.
3. The script creates, updates, or reuses the target provider based on env inputs.
4. The script attaches that provider to the app.
5. The script prints the app client ID and can write it into a local env file.
6. The app signs the end user in with PKCE.
7. Runtime code passes the authenticated Kontext token into `kontext.requireProvider(...)`.
8. If the provider is not connected yet, handle `ProviderConnectionRequiredError` and send the user to `connectUrl`.
9. Retry after connect and continue the task.

Provider-specific configuration belongs in the command inputs, not in this skill. The skill should stay generic.

## Execution Rules

Follow these rules in order:

1. Validate bootstrap inputs first.
2. If `KONTEXT_SERVICE_ACCOUNT_CLIENT_ID` or `KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET` is missing, stop immediately and tell the user exactly which variable is missing.
3. If `KONTEXT_OUTPUT_ENV_FILE` is missing, infer a conventional ignored local env target when the repo already clearly uses one, for example `apps/web/.env.local`, and pass it inline when running the helper.
4. If the user names an existing provider such as `google-workspace`, treat that as **reuse and attach first**. If no provider exists and the handle matches a known preset key, create that preset provider. Do not invent broad provider recipes unless the user explicitly asked for provider creation details.
5. Run the bundled helper from the installed skill directly. Do not vendor or copy the helper into the target repo.
6. Keep repo exploration narrow until bootstrap is done or blocked. Do not pivot into unrelated examples, demos, or legacy provider flows just because they mention the same provider.
7. After bootstrap succeeds, edit the target runtime surface and remove the hardcoded credential path.

## Required Inputs

Service account:
- `KONTEXT_SERVICE_ACCOUNT_CLIENT_ID`
- `KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET`
- `KONTEXT_API_BASE_URL` (optional, defaults to `https://api.kontext.dev`)
- `MANAGEMENT_API_RESOURCE` (optional, defaults to `${KONTEXT_API_BASE_URL}/api/v1`)

Target application:
- `KONTEXT_APPLICATION_ID`, or
- `KONTEXT_APPLICATION_NAME`

Create the app when missing:
- `KONTEXT_CREATE_APPLICATION=true`
- `KONTEXT_APPLICATION_REDIRECT_URIS_JSON='["http://localhost:3000/callback"]'`

Optional public-app settings:
- `KONTEXT_APPLICATION_SCOPES_JSON` defaults to `["mcp:invoke"]`
- `KONTEXT_APPLICATION_PKCE_REQUIRED` defaults to `true`
- `KONTEXT_APPLICATION_ALLOWED_RESOURCES_JSON` defaults to `["mcp-gateway"]` when creating a new app

Target provider:
- `KONTEXT_PROVIDER_ID`, or
- `KONTEXT_PROVIDER_HANDLE`

Create or update a preset provider:
- `KONTEXT_PROVIDER_TYPE=preset`
- `KONTEXT_PROVIDER_PRESET_KEY`
- `KONTEXT_PROVIDER_SCOPES_JSON`
- `KONTEXT_PROVIDER_CLIENT_ID`
- `KONTEXT_PROVIDER_CLIENT_SECRET`

Create or update a custom provider:
- `KONTEXT_PROVIDER_TYPE=custom`
- `KONTEXT_PROVIDER_DISPLAY_NAME`
- `KONTEXT_PROVIDER_AUTH_METHOD`
- `KONTEXT_PROVIDER_OAUTH_ISSUER`
- `KONTEXT_PROVIDER_OAUTH_PROVIDER`
- `KONTEXT_PROVIDER_SCOPES_JSON`
- `KONTEXT_PROVIDER_CLIENT_ID`
- `KONTEXT_PROVIDER_CLIENT_SECRET`
- `KONTEXT_PROVIDER_KEY`

Optional provider attachment settings:
- `KONTEXT_PROVIDER_MCP_ENABLED=true|false`

Optional env output:
- `KONTEXT_OUTPUT_ENV_FILE` such as `.env.local`
- `KONTEXT_PUBLIC_CLIENT_ID_ENV_NAME` defaults to `NEXT_PUBLIC_KONTEXT_CLIENT_ID`

## Secret Handling Rules

Follow these rules strictly:

- Never print `KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET` unless the user explicitly asks.
- Never print `KONTEXT_SERVER_TOKEN` unless the user explicitly asks.
- Never write service account credentials, shared server tokens, or live provider credentials into tracked files.
- Only write the **public** client ID into env output files.
- Never commit secrets or live tokens.
- If the target env file is tracked, stop and tell the user instead of writing into it.

## Workflow

1. Confirm the request really wants token mode and a public PKCE app.
2. Validate the bootstrap inputs before scanning the repo:
   - service account vars
   - output env target
   - application name or ID
   - provider handle or create/update inputs
3. Run the bundled setup helper immediately. Do this before broad codebase exploration:

```bash
node scripts/bootstrap-token-mode.mjs
```

4. If the helper is blocked, stop with the exact missing input. Do not continue with unrelated repo exploration.
5. Find the hardcoded provider credential path in the specific target surface the user asked for:
   - `Bearer ...`
   - `process.env.*TOKEN`
   - `process.env.*KEY`
   - literal provider access tokens
6. Read the output:
   - public app client ID
   - provider ID and handle
   - whether the provider was created, updated, or reused
   - whether the env file was written
7. Replace the hardcoded credential path with token mode:

```ts
const credential = await kontext.requireProvider(providerHandle, token);
```

8. If the runtime surface is an MCP server or backend route, keep the user token flowing into that server call.
9. If runtime code can hit a first-time-connect case, handle `ProviderConnectionRequiredError` and use `err.connectUrl`.
10. Summarize the final setup and the exact runtime provider handle.

## Preferred Command Pattern

Bootstrap a new public PKCE app, create a preset provider, attach it, and write the public client ID into `.env.local`:

```bash
KONTEXT_SERVICE_ACCOUNT_CLIENT_ID=... \
KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET=... \
KONTEXT_APPLICATION_NAME="My Demo Agent" \
KONTEXT_CREATE_APPLICATION=true \
KONTEXT_APPLICATION_REDIRECT_URIS_JSON='["http://localhost:3000/callback"]' \
KONTEXT_PROVIDER_HANDLE="google-workspace" \
KONTEXT_PROVIDER_TYPE=preset \
KONTEXT_PROVIDER_PRESET_KEY=google-workspace \
KONTEXT_PROVIDER_SCOPES_JSON='["scope-a","scope-b"]' \
KONTEXT_OUTPUT_ENV_FILE=.env.local \
KONTEXT_PUBLIC_CLIENT_ID_ENV_NAME=NEXT_PUBLIC_KONTEXT_DEMO_CLIENT_ID \
node scripts/bootstrap-token-mode.mjs
```

Attach an existing provider to an existing public app and only print the public client ID:

```bash
KONTEXT_SERVICE_ACCOUNT_CLIENT_ID=... \
KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET=... \
KONTEXT_APPLICATION_ID=app_... \
KONTEXT_PROVIDER_ID=prov_... \
node scripts/bootstrap-token-mode.mjs
```

Create or update a custom OAuth provider:

```bash
KONTEXT_SERVICE_ACCOUNT_CLIENT_ID=... \
KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET=... \
KONTEXT_APPLICATION_NAME="My Agent" \
KONTEXT_CREATE_APPLICATION=true \
KONTEXT_APPLICATION_REDIRECT_URIS_JSON='["http://localhost:3000/callback"]' \
KONTEXT_PROVIDER_TYPE=custom \
KONTEXT_PROVIDER_DISPLAY_NAME="My API" \
KONTEXT_PROVIDER_AUTH_METHOD=user_oauth \
KONTEXT_PROVIDER_OAUTH_ISSUER="https://provider.example.com" \
KONTEXT_PROVIDER_OAUTH_PROVIDER="provider-name" \
KONTEXT_PROVIDER_SCOPES_JSON='["scope-a","scope-b"]' \
node scripts/bootstrap-token-mode.mjs
```

## Runtime Integration Pattern

For client auth:

```ts
const client = createKontextClient({
  clientId: process.env.NEXT_PUBLIC_KONTEXT_CLIENT_ID!,
  redirectUri: `${window.location.origin}/callback`,
  onAuthRequired: (url) => {
    window.location.href = url.toString();
  },
});
```

For runtime credential exchange:

```ts
const kontext = new Kontext({
  clientId: process.env.NEXT_PUBLIC_KONTEXT_CLIENT_ID!,
  apiUrl: process.env.KONTEXT_API_URL,
});

const credential = await kontext.requireProvider("provider-handle", token);
```

First-time connect handling:

```ts
import { ProviderConnectionRequiredError } from "@kontext-dev/js-sdk/errors";

try {
  const credential = await kontext.requireProvider("provider-handle", token);
} catch (error) {
  if (error instanceof ProviderConnectionRequiredError && error.connectUrl) {
    window.location.href = error.connectUrl;
  }
  throw error;
}
```

## Prompt Template

Use this when the user wants a coding agent to remove hardcoded creds:

```text
Use $kontext-token-mode-bootstrap.

This app currently uses hardcoded end-user credentials for an external provider. Replace that with Kontext token mode.

Bootstrap:
- create or reuse a public Kontext application with PKCE
- create, update, or reuse the provider described by the current env inputs
- attach that provider to the public app
- write the public client ID into the local env file if KONTEXT_OUTPUT_ENV_FILE is set

Runtime:
- keep the end user on PKCE
- use kontext.requireProvider("<provider-handle>", token) at runtime
- if the provider is not connected yet, use the hosted connect flow and continue after connect

Do not switch this to confidential userId mode.
Do not hardcode provider scopes into the skill. Read them from the current env or prompt.
```

## Success Output

Return a short summary in this shape:

Token-mode bootstrap configured.

Application:
- Name: <application name>
- Application ID: <application id>
- OAuth type: public
- Client ID: <public client id>

Provider:
- Handle: <provider handle>
- Provider ID: <provider id>
- Auth method: <auth method>
- Status: <created|updated|reused>
- App attachment: <attached_now|already_attached>

Runtime:
- Retrieval method: kontext.requireProvider(providerHandle, token)
- First-time connect: hosted connect page

Env output:
- File: <only show when written>
- Variable: <only show when written>
