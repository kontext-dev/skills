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
  require(integration: IntegrationName, token: string): Promise<IntegrationCredential>;
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

## Scoped Credentials

### `kontext.require(integration, token)`

Exchange a session token for integration-scoped credentials. Returns:

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

### `kontext.requireCredentials(integration, token)`

For integrations using `connectType: "user_token"` (API keys rather than OAuth). Returns:

```typescript
interface IntegrationResolvedCredentials {
  integration: IntegrationName;
  integrationId: string;
  credentials: Record<string, string>;  // Key-value pairs (e.g. { apiKey: "..." })
}
```

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

## Token Verification

For custom auth flows outside the middleware:

```typescript
import { KontextTokenVerifier } from "@kontext-dev/js-sdk/verify";

const verifier = new KontextTokenVerifier({
  jwksUrl: "https://api.kontext.dev/.well-known/jwks.json",
  issuer: "https://api.kontext.dev",
  audience: "your-resource-server-url",
});

const result = await verifier.verify(token);
if (result.success) {
  console.log(result.claims.sub, result.claims.scopes);
}
```
