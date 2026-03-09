---
name: kontext-sdk
description: Integrate the Kontext identity control plane into TypeScript applications using @kontext-dev/js-sdk. Use when building MCP servers with scoped credentials, client apps with OAuth auth flows, Vercel AI SDK tool adapters, React apps with Kontext hooks, or Cloudflare Agents with the withKontext mixin. Triggers on imports of @kontext-dev/js-sdk, mentions of Kontext SDK, or requests to add identity/credential management to AI agent architectures.
---

# Kontext SDK Integration

Integrate the Kontext identity control plane into TypeScript applications. Kontext provides runtime identity, scoped credentials, and audit trails for AI agents.

## Step 1: Scan the Codebase First (MANDATORY)

Before asking the user anything, **analyze the project** to determine the right integration path. Run these searches in parallel:

1. **Read `package.json`** — check dependencies for: `react`, `next`, `express`, `ai` (Vercel AI SDK), `agents` (Cloudflare), `@modelcontextprotocol/sdk`, `@kontext-dev/js-sdk`
2. **Find framework config files** — look for `next.config.*`, `wrangler.toml`, `vite.config.*`, `tsconfig.json`
3. **Find existing auth and credential patterns** — search for `API_KEY`, `Bearer`, `accessToken`, `Authorization`, `process.env.*_TOKEN`, `process.env.*_KEY`, hardcoded API keys
4. **Find external API calls** — search for `fetch(`, `axios`, API client imports such as `@octokit`, `@slack/web-api`, `@linear/sdk`
5. **Find agent and AI patterns** — search for `generateText`, `streamText`, `useChat`, `useCompletion`, `McpServer`, `Agent`, LLM client instantiation
6. **Find the app's user auth provider** — check for `@clerk/`, `@auth0/`, `@convex-dev/auth`, `next-auth`, `@supabase/auth-helpers`, `firebase/auth`, `@workos-inc/`, `jose`, `jsonwebtoken`

**Important:** if the app has its own user auth, do not automatically recommend `userId` mode. First determine whether the app already has:
- a usable upstream issuer + JWKS + audience from its auth provider, or
- the ability to mint its own short-lived JWTs and expose a JWKS endpoint

If neither exists, inline Kontext token mode is usually the safer recommendation.

## Step 2: Classify the Architecture

Based on scan results, classify into one or more integration paths:

| If you find... | Integration path | Reference |
|----------------|-----------------|-----------|
| `express` + `@modelcontextprotocol/sdk` | **Server SDK** — Express middleware, scoped credentials | `references/server.md` |
| `react` or `next` | **React hooks** — `KontextProvider`, `useKontext` | `references/frameworks.md` |
| `ai` with `generateText` or `streamText` | **AI adapter** — `toKontextTools` converts Kontext tools to Vercel AI CoreTool format | `references/frameworks.md` |
| `agents` or `wrangler.toml` | **Cloudflare adapter** — `withKontext` mixin | `references/frameworks.md` |
| Client app with auth flows, no server | **Client SDK** — `createKontextClient` with OAuth | `references/client.md` |
| Own user auth plus server-side credential retrieval needs | **Credential vault** — partner connect bootstrap plus `kontext.require(integration, { userId })` | `references/credential-vault.md` |
| Infrastructure or automation scripts | **Management SDK** — programmatic control | `references/management.md` |

**Most full-stack apps need multiple paths.** A typical React + Express app may need:
- Server SDK for the backend
- React hooks for frontend auth state
- AI adapter if using Vercel AI SDK

## Step 3: Identify Integration Points

Look for places where the app accesses external services. These are where Kontext replaces hardcoded credentials:

- **Hardcoded API keys** → Replace with `kontext.require("github", token)` or `requireCredentials(...)`
- **Environment variable tokens** such as `process.env.GITHUB_TOKEN` → Replace with scoped Kontext credentials
- **OAuth flows built from scratch** → Replace with Kontext-managed OAuth where appropriate
- **Direct API calls** to GitHub, Slack, Linear, Google, etc. → Wrap with Kontext credential exchange
- **Server-to-server flows** where the backend knows the stable app user ID → Consider credential vault mode: `kontext.require("github", { userId: platformUserId })`

**Important:** `userId` mode is not enough by itself for first-time connect. In the current implementation:
- it does not return `connectUrl` on `IntegrationConnectionRequiredError`
- it requires a confidential app configured for external auth
- first-time connect for externally-authenticated users uses partner connect sessions

## Step 4: Present a Concrete Plan

After scanning, present findings to the user:

1. **What you found** — for example: "This is a Next.js app with a React frontend, API routes, Convex Auth, and Vercel AI SDK. It calls GitHub using a PAT in `lib/github.ts`."
2. **What Kontext replaces** — for example: "Kontext would replace the PAT with scoped, user-consented credentials."
3. **Recommended integration path** — be explicit about why:
   - token mode
   - credential vault mode
   - mixed approach
4. **Specific files to modify**
5. **Ask for confirmation** before making changes

Do not just list integration paths and ask the user to choose. Infer the correct path from the code and the app's auth shape.

## Flow Selection

Use this decision rule:

### Use token mode when:
- the app already has a Kontext bearer token
- the app needs inline `connectUrl` support
- the app wants users to connect integrations during a workflow
- the app does not have a usable issuer/JWKS story for external auth

### Use credential vault (`userId`) mode when:
- the backend already knows the app's stable user ID
- the app is a confidential client
- external auth is configured
- users can connect integrations through a separate settings or onboarding flow

### Do not recommend pure `userId` mode as "no frontend/auth work" unless you have verified:
- there is already a connect flow for first-time onboarding, or
- the app can implement partner connect bootstrap with JWT + JWKS


## Package

```bash
npm install @kontext-dev/js-sdk
```

## Scoped Credentials

### Token mode

Exchange a user's bearer token for integration-scoped credentials:

```typescript
const cred = await kontext.require("github", authInfo!.token!);
const res = await fetch("https://api.github.com/user/repos", {
  headers: { Authorization: cred.authorization },
});
```

### Credential Vault (userId mode)

For server-to-server credential retrieval where the backend already knows the app's stable user ID:

```typescript
const cred = await kontext.require("github", { userId: platformUserId });
```

Notes:
- `clientSecret` authenticates the request
- blank or whitespace-only userId values are rejected
- `IntegrationConnectionRequiredError` will not include `connectUrl`
- token mode and userId mode use separate caches

**Critical limitation:** In the current implementation, userId exchange requires a confidential application with `externalAuth.enabled`. First-time connect for these users is a separate partner connect flow, not something `kontext.require(..., { userId })` can generate inline.

If the user says "I use Convex/Auth0/Clerk already", verify whether they actually have:
- issuer
- audience
- JWKS URL
- signing authority

If not, do not oversell credential vault mode as turnkey.

### `requireCredentials(integration, token)`

For integrations with `connectType: "user_token"` such as API-key-style credentials:

```typescript
const resolved = await kontext.requireCredentials("custom-api", token);
// resolved.credentials = { apiKey: "...", apiSecret: "..." }
```

Only accepts a raw token. It does not support `{ userId }` mode.

## External Auth Requirements

When recommending credential vault mode for an app with its own auth, call out the required external-auth setup explicitly:

- confidential Kontext application
- `externalAuth.enabled`
- `issuer`
- `jwksUrl`
- `audience`
- `allowedAlgorithms`
- `partnerApiKey`
- optional `allowedReturnUrls`
- optional `requiredClaims`

If the user's auth provider does not expose issuer/JWKS in a way Kontext can verify, the app must either:
- mint its own short-lived JWTs and expose its own JWKS, or
- use token mode instead

See `references/credential-vault.md` for the full setup guide, including provider-specific values and code examples.

## Orchestrator

`createKontextOrchestrator` is a hybrid client that combines gateway-routed tools with direct internal MCP connections. It is used when `createKontextClient` is called without a `url` parameter:

```typescript
import { createKontextOrchestrator } from "@kontext-dev/js-sdk";

const orchestrator = createKontextOrchestrator({
  clientId: "your-app-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthRequired: (url) => {
    window.location.href = url.toString();
  },
});

await orchestrator.connect();
const tools = await orchestrator.tools.list();
```

Same interface as `KontextClient`. Use when the app needs both Kontext-managed integrations and direct MCP server connections.

## Subpath Exports

Use the narrowest import path for the integration:

| Import | Export | Use For |
|--------|--------|---------|
| `@kontext-dev/js-sdk` | `createKontextClient`, `createKontextOrchestrator`, `Kontext` | Root convenience |
| `@kontext-dev/js-sdk/client` | `createKontextClient` | Client SDK |
| `@kontext-dev/js-sdk/server` | `Kontext` | Server SDK |
| `@kontext-dev/js-sdk/ai` | `toKontextTools` | Vercel AI SDK adapter |
| `@kontext-dev/js-sdk/react` | `useKontext`, `KontextProvider`, `useKontextContext` | React hooks |
| `@kontext-dev/js-sdk/react/cloudflare` | `useKontextAgent`, `useKontextContext` | React + Cloudflare Agents |
| `@kontext-dev/js-sdk/cloudflare` | `withKontext`, `KontextCloudflareOAuthProvider`, `DurableObjectKontextStorage` | Cloudflare adapter |
| `@kontext-dev/js-sdk/management` | `KontextManagementClient` | Management API |
| `@kontext-dev/js-sdk/mcp` | `KontextMcp` | Low-level MCP client |
| `@kontext-dev/js-sdk/errors` | Error classes and utilities | Error handling |
| `@kontext-dev/js-sdk/verify` | `KontextTokenVerifier` | Token verification |
| `@kontext-dev/js-sdk/oauth` | OAuth utilities | OAuth helpers |

## Peer Dependencies

Install only what the integration path requires:

| Package | Version | Required For |
|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | ^1.26.0 | Server SDK |
| `express` | ^4.21.0 or ^5.0.0 | Server SDK |
| `ai` | ^4.0.0 | Vercel AI adapter |
| `react` | ^18.0.0 or ^19.0.0 | React adapter |
| `agents` | >=0.4.0 | Cloudflare adapter |

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `KONTEXT_CLIENT_SECRET` | Server SDK | Client secret for token exchange. Auto-read by constructor. |
| `KONTEXT_TOKEN_ISSUER` | Server SDK | Custom token issuer URL(s). Comma-separated for multiple. |
| `KONTEXT_CLIENT_ID` | Cloudflare adapter | Application client ID. Auto-read by `withKontext`. |

## Error Handling

### Error classes and utilities

| Export | Type | Description |
|--------|------|-------------|
| `isKontextError` | Type guard | Check if error originates from Kontext SDK |
| `AuthorizationRequiredError` | Error class | User needs to authenticate |
| `OAuthError` | Error class | OAuth flow failure |
| `IntegrationConnectionRequiredError` | Error class | User has not connected the integration |
| `isNetworkError` | Detection function | Detect unreachable API and transport failures |
| `isUnauthorizedError` | Detection function | Detect expired or invalid auth |
| `translateError` | Error translator | Unified error translation |
| `ElicitationEntry` | Type | Elicitation flow entry |

### Basic pattern

```typescript
import {
  isKontextError,
  isNetworkError,
  isUnauthorizedError,
  translateError,
} from "@kontext-dev/js-sdk/errors";

try {
  const cred = await kontext.require("github", token);
} catch (err) {
  const translated = translateError(err);
  if (isUnauthorizedError(translated)) {
    // Re-authenticate
  } else if (isNetworkError(translated)) {
    // Retry or fallback
  } else if (isKontextError(translated)) {
    // Inspect translated.code
  }
}
```

### Integration Connection Required

In token mode:

```typescript
import { IntegrationConnectionRequiredError } from "@kontext-dev/js-sdk/errors";

try {
  const cred = await kontext.require("github", token);
} catch (err) {
  if (err instanceof IntegrationConnectionRequiredError) {
    // err.connectUrl may be present in token mode
  }
}
```

In userId mode:

```typescript
try {
  const cred = await kontext.require("github", { userId });
} catch (err) {
  if (err instanceof IntegrationConnectionRequiredError) {
    // No err.connectUrl here
    // Redirect user to your app's integrations/settings flow instead
  }
}
```

## CRITICAL Rules

- Never hardcode `clientSecret` in source code. Use `KONTEXT_CLIENT_SECRET`.
- Never store access tokens in client-side storage unless using the SDK's intended storage abstraction.
- Use `kontext.require()` for OAuth integrations and `kontext.requireCredentials()` for API-key integrations.
- Install only the peer dependencies needed for the chosen subpath export.
- The `Kontext` server class auto-reads `KONTEXT_CLIENT_SECRET` from env.
- Always scan the codebase before recommending an integration path.
- Never present `userId` mode as a turnkey solution unless you have verified the external-auth bootstrap story.
- If recommending credential vault mode, explicitly state whether the app already has a usable issuer/JWKS or needs to mint its own.
