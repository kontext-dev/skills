---
name: kontext-sdk
description: Integrate the Kontext identity control plane into TypeScript applications using @kontext-dev/js-sdk. Use when building MCP servers with scoped credentials, client apps with OAuth auth flows, Vercel AI SDK tool adapters, React apps with Kontext hooks, or Cloudflare Agents with the withKontext mixin. Triggers on imports of @kontext-dev/js-sdk, mentions of Kontext SDK, or requests to add identity/credential management to AI agent architectures.
---

# Kontext SDK Integration

Integrate the Kontext identity control plane into TypeScript applications. Kontext provides runtime identity, scoped credentials, and audit trails for AI agents.

## Documentation Index

Fetch the complete documentation index at: https://docs.kontext.dev/llms.txt
Use this file to discover all available pages before exploring further.

## Package

```bash
npm install @kontext-dev/js-sdk
```

## Detect Integration Path

Determine which path fits the developer's architecture:

1. **What are they building?**
   - MCP server (Express/Node) -> Server SDK
   - App-facing client with auth -> Client SDK
   - Vercel AI SDK app -> AI adapter
   - React frontend -> React hooks
   - Cloudflare Workers/Agents -> Cloudflare adapter
   - Infrastructure automation -> Management SDK

2. **Read the matching reference file** for implementation details:
   - **Server SDK**: `references/server.md` - Express middleware, MCP servers, scoped credentials
   - **Client SDK**: `references/client.md` - Auth flows, tool execution, token storage
   - **Frameworks**: `references/frameworks.md` - Vercel AI SDK, React hooks, Cloudflare Agents
   - **Management**: `references/management.md` - Programmatic control of applications, integrations, sessions

3. **Multiple paths combine**. A typical full-stack app uses:
   - Server SDK for the backend MCP server
   - Client SDK or Orchestrator for the app layer
   - React hooks for the frontend
   - AI adapter if using Vercel AI SDK

## Subpath Exports

Use the narrowest import path for the integration:

| Import | Export | Use For |
|--------|--------|---------|
| `@kontext-dev/js-sdk` | `createKontextClient`, `createKontextOrchestrator`, `Kontext` | Root convenience |
| `@kontext-dev/js-sdk/client` | `createKontextClient` | Client SDK |
| `@kontext-dev/js-sdk/server` | `Kontext` | Server SDK (Express + MCP) |
| `@kontext-dev/js-sdk/ai` | `toKontextTools` | Vercel AI SDK adapter |
| `@kontext-dev/js-sdk/react` | `useKontext`, `KontextProvider`, `useKontextContext` | React hooks |
| `@kontext-dev/js-sdk/react/cloudflare` | `useKontextAgent`, `useKontextContext` | React + Cloudflare Agents |
| `@kontext-dev/js-sdk/cloudflare` | `withKontext`, `KontextCloudflareOAuthProvider`, `DurableObjectKontextStorage` | Cloudflare adapter |
| `@kontext-dev/js-sdk/management` | `KontextManagementClient` | Management API |
| `@kontext-dev/js-sdk/mcp` | `KontextMcp` | Low-level MCP client |
| `@kontext-dev/js-sdk/errors` | `KontextError`, `isKontextError`, `isNetworkError`, `isUnauthorizedError` | Error handling |
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

## Common Patterns

### Error Handling

```typescript
import { isKontextError, isNetworkError, isUnauthorizedError } from "@kontext-dev/js-sdk/errors";

try {
  const cred = await kontext.require("github", token);
} catch (err) {
  if (isUnauthorizedError(err)) {
    // Token expired or invalid - re-authenticate
  } else if (isNetworkError(err)) {
    // Kontext API unreachable - retry or fallback
  } else if (isKontextError(err)) {
    // Other Kontext error - check err.code
  }
}
```

### Integration Connection Required

When a user hasn't connected an integration, the SDK throws `IntegrationConnectionRequiredError` with a `connectUrl`. Surface this URL to the user so they can authorize.

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

## CRITICAL Rules

- NEVER hardcode `clientSecret` in source code. Use `KONTEXT_CLIENT_SECRET` env var.
- NEVER store access tokens in client-side code or localStorage without the SDK's storage abstraction.
- ALWAYS use `kontext.require()` or `kontext.requireCredentials()` for scoped credentials instead of passing raw tokens.
- ALWAYS install peer dependencies for the specific subpath export being used.
- The `Kontext` server class auto-reads `KONTEXT_CLIENT_SECRET` from env - do not pass it in constructor unless overriding.
