# Server SDK Reference

Build MCP servers with Express middleware, scoped credentials, and production controls.

## Install

```bash
npm install @kontext-dev/js-sdk @modelcontextprotocol/sdk express
```

## Quick Start

```typescript
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Kontext } from "@kontext-dev/js-sdk/server";

// 1. Create Kontext instance
const kontext = new Kontext({
  clientId: "your-app-client-id",
  // clientSecret auto-read from KONTEXT_CLIENT_SECRET env var
});

// 2. Create MCP server with tools
const mcpServer = new McpServer({ name: "my-server", version: "1.0.0" });

mcpServer.tool("list-repos", "List GitHub repos", {}, async (_args, { authInfo }) => {
  // 3. Exchange the session token for scoped GitHub credentials
  const { accessToken } = await kontext.require("github", authInfo!.token!);

  const res = await fetch("https://api.github.com/user/repos", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const repos = await res.json();

  return { content: [{ type: "text", text: JSON.stringify(repos) }] };
});

// 4. Mount as Express middleware
const app = express();
app.use(kontext.middleware(mcpServer));
app.listen(3000);
```

## Kontext Class

```typescript
interface KontextOptions {
  clientId: string;
  apiUrl?: string;           // default: "https://api.kontext.dev"
  clientSecret?: string;     // default: KONTEXT_CLIENT_SECRET env var
  tokenIssuer?: string | string[];
}

class Kontext {
  constructor(options: KontextOptions);
  destroy(): Promise<void>;
  middleware(server: McpServerOrFactory, options?: MiddlewareOptions): Router;
  // Token mode (standard MCP auth — exchange user Bearer token)
  require(integration: IntegrationName, token: string): Promise<IntegrationCredential>;
  // Credential vault mode (server-to-server — no user token needed)
  require(integration: IntegrationName, options: { userId: string }): Promise<IntegrationCredential>;
  requireCredentials(integration: IntegrationName, token: string): Promise<IntegrationResolvedCredentials>;
}
```

## Middleware Options

```typescript
interface MiddlewareOptions {
  mcpPath?: string;                  // default: "/mcp"
  resourceServerUrl?: string;
  dangerouslyOmitAuth?: boolean;     // NEVER use in production
  bodyLimit?: string | number;       // default: "1mb"
  verifier?: OAuthTokenVerifier;
  metadataTransform?: (metadata: OAuthMetadata) => OAuthMetadata;
  onSessionInitialized?: (sessionId: string, authInfo?: AuthInfo, transport?: StreamableHTTPServerTransport) => void;
  onSessionClosed?: (sessionId: string) => void;
}
```

### Registered Routes

The middleware auto-registers:
1. `/.well-known/oauth-authorization-server` — OAuth authorization server metadata
2. `/.well-known/oauth-protected-resource/mcp` — Protected resource metadata (RFC 9728)
3. `POST|GET|DELETE /mcp` — MCP transport endpoint

Mount at app root — `.well-known` routes must be accessible at domain root.

### Custom Token Verification (verifier option)

Supply a `verifier` to integrate with an existing auth gateway instead of using Kontext's built-in token verification:

```typescript
kontext.middleware(() => createServer(), {
  verifier: async (token) => {
    // Custom verification logic for existing auth gateways
    return { sub: "user-id", scope: "..." };
  },
});
```

## Scoped Credentials

### Token mode: `kontext.require(integration, token)`

Exchange a user's session token for integration-scoped credentials. Returns:

```typescript
interface IntegrationCredential {
  accessToken: string;
  tokenType: string;
  authorization: string;    // Ready-to-use "Bearer <token>" header value
  expiresIn?: number;
  scope?: string;
  integration: IntegrationName;
}
```

Use `authorization` directly in HTTP headers:

```typescript
const cred = await kontext.require("github", authInfo!.token!);
const res = await fetch(url, {
  headers: { Authorization: cred.authorization },
});
```

### Credential vault mode: `kontext.require(integration, { userId })`

For server-to-server flows where you already know the user's platform ID — no Bearer token needed:

```typescript
const cred = await kontext.require("github", { userId: "platform-user-123" });
const res = await fetch("https://api.github.com/user/repos", {
  headers: { Authorization: cred.authorization },
});
```

- Uses `subject_token_type = "urn:kontext:user-id"` for RFC 8693 token exchange
- The `clientSecret` authenticates the request (no user Bearer token)
- Blank/whitespace-only userIds are rejected with `TypeError`
- `IntegrationConnectionRequiredError` will **not** include `connectUrl` (no user session)
- Cache is mode-separated — token and userId calls never collide

### `kontext.requireCredentials(integration, token)`

For integrations with category `internal_mcp_credentials` that use credential schemas (API keys, static secrets) rather than OAuth token exchange. Unlike `require()`, this method returns a key-value map defined by the integration's credential schema.

```typescript
interface IntegrationResolvedCredentials {
  integration: IntegrationName;
  integrationId: string;
  credentials: Record<string, string>;  // Key-value pairs defined by credential schema
}
```

Usage:

```typescript
const resolved = await kontext.requireCredentials("custom-api", authInfo!.token!);
// resolved.credentials = { apiKey: "sk-...", apiSecret: "..." }

const res = await fetch("https://api.example.com/data", {
  headers: { "X-API-Key": resolved.credentials.apiKey },
});
```

Key differences from `require()`:
- Returns `credentials` (a `Record<string, string>`) instead of `accessToken`/`authorization`
- Only accepts a raw token — does **not** support `{ userId }` mode
- Used for `connectType: "user_token"` or `connectType: "credentials"` integrations
- The credential schema is defined on the integration (e.g., `{ apiKey: "string", apiSecret: "string" }`)
- No built-in `authorization` header formatting — use the credential fields directly

## Known Integrations

Type-safe integration names: `"github"`, `"gmail"`, `"google-calendar"`, `"google-drive"`, `"slack"`, `"linear"`, `"notion"`, `"jira"`, `"confluence"`, `"figma"`, `"stripe"`, `"shopify"`, `"salesforce"`, `"hubspot"`, `"asana"`, `"discord"`, `"twilio"`, `"sendgrid"`, `"openai"`, `"anthropic"`.

Custom integration names (any string) are also supported.

## MCP Server Factory Pattern

Use a factory function to create a fresh MCP server per session:

```typescript
app.use(
  kontext.middleware(() => {
    const server = new McpServer({ name: "my-server", version: "1.0.0" });
    // Register tools...
    return server;
  })
);
```

## Production Deployment

See [production.md](production.md) for the full checklist.

Key requirements:
1. **Always use factory function** — `kontext.middleware(() => createServer())` not `kontext.middleware(server)`. MCP spec mandates 1:1 server-to-transport.
2. **Set client secret** — `KONTEXT_CLIENT_SECRET` env var enables session tracking and telemetry.
3. **Configure token issuer** — `KONTEXT_TOKEN_ISSUER` if your OAuth server uses a non-standard issuer.
4. **Set resourceServerUrl** — When behind reverse proxy, so OAuth metadata contains correct URLs.
5. **Graceful shutdown** — SDK auto-registers SIGINT/SIGTERM handlers. Call `kontext.destroy()` for dynamic instances.

## Supported Integrations

GitHub, Slack, Linear, Notion, Jira, Confluence, Gmail, Google Calendar, Google Drive, Figma, Stripe, Shopify, Salesforce, HubSpot, Asana, Discord, Twilio, SendGrid, OpenAI, Anthropic, plus custom integrations.

## Token Verification

For custom auth flows outside the middleware — useful when authentication happens upstream in an API gateway or load balancer and you need to validate Kontext JWTs independently.

```typescript
import { KontextTokenVerifier } from "@kontext-dev/js-sdk/verify";

const verifier = new KontextTokenVerifier({
  jwksUrl: "https://api.kontext.dev/.well-known/jwks.json",
  issuer: "https://api.kontext.dev",
  audience: "your-resource-server-url",
});

// Full verification with error details
const result = await verifier.verify(token);
if (result.success) {
  console.log(result.claims.sub);    // User subject
  console.log(result.claims.scopes); // Granted scopes
  console.log(result.claims.email);  // User email (if present)
} else {
  console.error(result.error); // Verification failure reason
}

// Simplified check — returns claims or null
const claims = await verifier.verifyOrNull(token);
if (claims) {
  // Token is valid
}
```

When to use:
- API gateway already strips/validates tokens and passes claims downstream
- Custom middleware stack where Kontext's built-in auth is bypassed via `dangerouslyOmitAuth`
- Non-Express environments where the middleware cannot be mounted

## Low-Level MCP Client (`KontextMcp`)

Direct MCP protocol access with built-in OAuth handling. Use when you need raw MCP operations without the higher-level `createKontextClient` abstractions.

```typescript
import { KontextMcp } from "@kontext-dev/js-sdk/mcp";

const mcp = new KontextMcp({
  clientId: "app_your-client-id",
  url: "https://my-mcp-server.com/mcp",  // Or omit for gateway mode
  onAuthRequired: async (url) => {
    // Handle OAuth — return the callback URL to complete the flow
    return await openBrowserAndWaitForCallback(url);
  },
});

// Connect and authenticate
await mcp.connect();

// List available tools
const tools = await mcp.listTools();

// Call a tool
const result = await mcp.callTool("github:list_repos", { page: 1 });

// Check runtime integration status
const integrations = await mcp.listRuntimeIntegrations();
// Each integration has: id, name, connected, connectType, authMode
// Admin-managed server tokens appear as connectType: "none", authMode: "server_token"

// Manage connection lifecycle
console.log(mcp.isConnected);  // boolean
console.log(mcp.sessionId);    // string | undefined
await mcp.disconnect();
await mcp.clearAuth();         // Remove stored tokens
```

### OAuth helpers

For building custom OAuth layers on top of `KontextMcp`:

```typescript
import { parseOAuthCallback, exchangeToken } from "@kontext-dev/js-sdk/verify";

// Parse the callback URL after user completes OAuth
const { code, state } = parseOAuthCallback(callbackUrl);

// Exchange the authorization code for tokens
const tokens = await exchangeToken({
  code,
  redirectUri: "http://localhost:3000/callback",
  clientId: "app_...",
  codeVerifier,
  tokenEndpoint: "https://api.kontext.dev/oauth2/token",
});
```

## Orchestrator (`createKontextOrchestrator`)

The orchestrator aggregates tools from multiple MCP servers and integrations into a single interface. Use when your application connects to multiple Kontext-powered MCP servers simultaneously.

```typescript
import { createKontextOrchestrator } from "@kontext-dev/js-sdk";

const orchestrator = createKontextOrchestrator({
  clientId: "app_your-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthRequired: (url) => { /* handle auth */ },
});

await orchestrator.connect();

// Tools from all connected integrations are unified
const tools = await orchestrator.tools.list();
const result = await orchestrator.tools.execute("github:create_issue", {
  repo: "acme/app",
  title: "Bug report",
});
```

The orchestrator is the underlying mechanism behind `createKontextClient` in hybrid mode (no `url` parameter). It routes through the Kontext gateway, aggregating tools from all integrations attached to the application.
