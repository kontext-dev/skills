---
name: kontext-sdk
description: Integrate the Kontext identity control plane into TypeScript applications using @kontext-dev/js-sdk. Use when building MCP servers with scoped credentials, client apps with OAuth auth flows, Vercel AI SDK tool adapters, React apps with Kontext hooks, or Cloudflare Agents with the withKontext mixin. Triggers on imports of @kontext-dev/js-sdk, mentions of Kontext SDK, or requests to add identity/credential management to AI agent architectures.
---

# Kontext SDK Integration

Integrate the Kontext identity control plane into TypeScript applications. Kontext provides runtime identity, scoped credentials, and audit trails for AI agents.

## Step 1: Scan the Codebase First (MANDATORY)

Before asking the user anything, **analyze the project** to determine the right integration path. Run these searches in parallel:

1. **Read `package.json`** — check dependencies for: `react`, `next`, `express`, `ai` (Vercel AI SDK), `agents` (Cloudflare), `@modelcontextprotocol/sdk`, `@kontext-dev/js-sdk` (already installed?)
2. **Find framework config files** — look for `next.config.*`, `wrangler.toml`, `vite.config.*`, `tsconfig.json`
3. **Find existing auth/credential patterns** — search for `API_KEY`, `Bearer`, `accessToken`, `Authorization`, `process.env.*_TOKEN`, `process.env.*_KEY`, hardcoded API keys
4. **Find external API calls** — search for `fetch(`, `axios`, API client imports (e.g., `@octokit`, `@slack/web-api`, `@linear/sdk`)
5. **Find agent/AI patterns** — search for `generateText`, `streamText`, `useChat`, `useCompletion`, `McpServer`, `Agent`, LLM client instantiation

## Step 2: Classify the Architecture

Based on scan results, classify into one or more integration paths:

| If you find... | Integration path | Reference |
|----------------|-----------------|-----------|
| `express` + `@modelcontextprotocol/sdk` | **Server SDK** — Express middleware, scoped credentials | `references/server.md` |
| `react` or `next` (frontend) | **React hooks** — `KontextProvider`, `useKontext` | `references/frameworks.md` (React section) |
| `ai` (Vercel AI SDK) with `generateText`/`streamText` | **AI adapter** — `toKontextTools` converts Kontext tools to CoreTool format | `references/frameworks.md` (Vercel section) |
| `agents` (Cloudflare) or `wrangler.toml` | **Cloudflare adapter** — `withKontext` mixin | `references/frameworks.md` (Cloudflare section) |
| Client app with auth flows, no server | **Client SDK** — `createKontextClient` with OAuth | `references/client.md` |
| Infrastructure/automation scripts | **Management SDK** — programmatic control | `references/management.md` |

**Most full-stack apps need multiple paths.** A typical React + Express app needs:
- Server SDK for the backend
- React hooks for the frontend
- Possibly AI adapter if using Vercel AI SDK

## Step 3: Identify Integration Points

Look for places where the app accesses external services. These are where Kontext replaces hardcoded credentials:

- **Hardcoded API keys** → Replace with `kontext.require("github", token)`
- **Environment variable tokens** (`process.env.GITHUB_TOKEN`) → Replace with scoped Kontext credentials
- **OAuth flows built from scratch** → Replace with Kontext's managed OAuth
- **Direct API calls** to GitHub, Slack, Linear, etc. → Wrap with Kontext credential exchange
- **Server-to-server flows** where you already know the user ID → Use credential vault mode: `kontext.require("github", { userId: platformUserId })`

## Step 4: Present a Concrete Plan

After scanning, present your findings to the user:

1. **What you found** — "This is a Next.js app with a React frontend, Express API routes, and Vercel AI SDK. It calls the GitHub API using a hardcoded PAT in `lib/github.ts`."
2. **What Kontext replaces** — "Kontext would replace the hardcoded `GITHUB_TOKEN` with scoped, user-consented credentials via OAuth."
3. **Integration plan** — List the specific files to modify and which SDK path applies to each.
4. **Ask for confirmation** before making changes.

Do NOT just list integration paths and ask the user to pick. Figure it out from the code.

## Documentation Index

Fetch the complete documentation index at: https://docs.kontext.dev/llms.txt
Use this file to discover all available pages before exploring further.

## Package

```bash
npm install @kontext-dev/js-sdk
```

## Scoped Credentials

### Token mode (standard MCP auth)

Exchange a user's Bearer token for integration-scoped credentials:

```typescript
const cred = await kontext.require("github", authInfo!.token!);
const res = await fetch("https://api.github.com/user/repos", {
  headers: { Authorization: cred.authorization },
});
```

### Credential Vault (userId mode)

For server-to-server flows where you already know the user's platform ID — no Bearer token needed:

```typescript
const cred = await kontext.require("github", { userId: platformUserId });
```

- The `clientSecret` authenticates the request (no user Bearer token)
- Blank/whitespace-only userIds are rejected with `TypeError`
- `IntegrationConnectionRequiredError` will **NOT** include `connectUrl` (no user session to generate one)
- Cache is mode-separated — token and userId calls never collide

### `requireCredentials(integration, token)`

For integrations using `connectType: "user_token"` (API keys rather than OAuth). Returns key-value credential pairs instead of a single access token:

```typescript
const resolved = await kontext.requireCredentials("custom-api", token);
// resolved.credentials = { apiKey: "...", apiSecret: "..." }
```

Only accepts a raw token — does not support `{ userId }` mode.

## Orchestrator

`createKontextOrchestrator` is a hybrid client that combines gateway-routed tools with direct internal MCP connections. Used when `createKontextClient` is called without a `url` parameter:

```typescript
import { createKontextOrchestrator } from "@kontext-dev/js-sdk";

const orchestrator = createKontextOrchestrator({
  clientId: "your-app-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthRequired: (url) => { window.location.href = url.toString(); },
});

await orchestrator.connect();
const tools = await orchestrator.tools.list();
```

Same interface as `KontextClient`. Use when your app needs both Kontext-managed integrations and direct MCP server connections.

## Subpath Exports

Use the narrowest import path for the integration:

| Import | Export | Use For |
|--------|--------|---------|
| `@kontext-dev/js-sdk` | `createKontextClient`, `createKontextOrchestrator`, `Kontext` | Root convenience |
| `@kontext-dev/js-sdk/client` | `createKontextClient` | Client SDK |
| `@kontext-dev/js-sdk/server` | `Kontext` | Server SDK (Express + MCP) |
| `@kontext-dev/js-sdk/ai` | `toKontextTools` | Vercel AI SDK adapter |
| `@kontext-dev/js-sdk/react` | `useKontext`, `KontextProvider`, `useKontextContext` | React hooks and auth state |
| `@kontext-dev/js-sdk/react/cloudflare` | `useKontextAgent`, `useKontextContext` | React + Cloudflare Agents |
| `@kontext-dev/js-sdk/cloudflare` | `withKontext`, `KontextCloudflareOAuthProvider`, `DurableObjectKontextStorage` | Cloudflare adapter |
| `@kontext-dev/js-sdk/management` | `KontextManagementClient` | Management API |
| `@kontext-dev/js-sdk/mcp` | `KontextMcp` | Low-level MCP client |
| `@kontext-dev/js-sdk/errors` | `isKontextError`, `AuthorizationRequiredError`, `OAuthError`, `IntegrationConnectionRequiredError`, `isNetworkError`, `isUnauthorizedError`, `translateError`, `ElicitationEntry` | Error handling |
| `@kontext-dev/js-sdk/verify` | `KontextTokenVerifier` | Token verification |
| `@kontext-dev/js-sdk/oauth` | OAuth utilities | OAuth helpers |

## Peer Dependencies

Install only what the integration path requires:

| Package | Version | Required For |
|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | ^1.26.0 | Server SDK (`/server`) |
| `express` | ^4.21.0 or ^5.0.0 | Server SDK (`/server`) |
| `ai` | ^4.0.0 | Vercel AI adapter (`/ai`) |
| `react` | ^18.0.0 or ^19.0.0 | React adapter (`/react`) |
| `agents` | >=0.4.0 | Cloudflare adapter (`/cloudflare`) |

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
| `IntegrationConnectionRequiredError` | Error class | User hasn't connected the integration — has `connectUrl` in token mode, **not** in userId mode |
| `isNetworkError` | Detection function | CORS/fetch failures, unreachable API (handles Chrome/Firefox/Safari patterns) |
| `isUnauthorizedError` | Detection function | Token expired or invalid |
| `translateError` | Error translator | Unified error translation shared by client, orchestrator, and server — also classifies MCP JSON-RPC error codes (e.g., `-32600` → `kontext_mcp_invalid_request`) |
| `ElicitationEntry` | Type | Elicitation flow entry |

### Basic pattern

```typescript
import { isKontextError, isNetworkError, isUnauthorizedError, translateError } from "@kontext-dev/js-sdk/errors";

try {
  const cred = await kontext.require("github", token);
} catch (err) {
  const translated = translateError(err);
  if (isUnauthorizedError(translated)) {
    // Token expired or invalid - re-authenticate
  } else if (isNetworkError(translated)) {
    // Kontext API unreachable - retry or fallback
  } else if (isKontextError(translated)) {
    // Other Kontext error - check translated.code
  }
}
```

### Integration Connection Required

When a user hasn't connected an integration, the SDK throws `IntegrationConnectionRequiredError` with a `connectUrl`. Surface this URL to the user so they can authorize:

```typescript
import { IntegrationConnectionRequiredError } from "@kontext-dev/js-sdk/errors";

try {
  const cred = await kontext.require("github", token);
} catch (err) {
  if (err instanceof IntegrationConnectionRequiredError) {
    // Redirect user to err.connectUrl to connect their GitHub account
  }
}
```

**Important**: In userId mode (`kontext.require("github", { userId })`) the error will **not** include `connectUrl` since there's no user session. Handle this case separately — e.g., prompt the user to connect via your app's settings page.

## CRITICAL Rules

- NEVER hardcode `clientSecret` in source code. Use `KONTEXT_CLIENT_SECRET` env var.
- NEVER store access tokens in client-side code or localStorage without the SDK's storage abstraction.
- ALWAYS use `kontext.require()` for OAuth integrations or `kontext.requireCredentials()` for API-key integrations. Never pass raw tokens.
- ALWAYS install peer dependencies for the specific subpath export being used.
- The `Kontext` server class auto-reads `KONTEXT_CLIENT_SECRET` from env — do not pass it in constructor unless overriding.
- ALWAYS scan the codebase before recommending an integration path. Never ask the user to pick from a menu.
