# Client SDK Reference

Build app-facing clients with auth, tool execution, and token storage.

## Install

```bash
npm install @kontext-dev/js-sdk
```

## Quick Start

```typescript
import { createKontextClient } from "@kontext-dev/js-sdk/client";

const client = createKontextClient({
  clientId: "your-app-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthRequired: (url) => {
    window.location.href = url.toString();
  },
});

// Connect to Kontext
await client.connect();

// List available tools
const tools = await client.tools.list();

// Execute a tool
const result = await client.tools.execute("tool-id", { query: "hello" });
```

## Client Config

```typescript
interface KontextClientConfig {
  clientId: string;
  redirectUri: string;
  url?: string;                    // Kontext server URL
  serverUrl?: string;
  storage?: KontextStorage;        // Custom token storage
  sessionKey?: string;
  onAuthRequired: (url: URL) => string | URL | void | Promise<string | URL | void>;
  onIntegrationRequired?: (url: string, info: { id: string; name?: string }) => void | Promise<void>;
  onStateChange?: (state: ClientState) => void;
}

type ClientState = "idle" | "connecting" | "ready" | "needs_auth" | "failed";
```

## Client Interface

```typescript
interface KontextClient {
  readonly state: ClientState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectPageUrl(): Promise<ConnectSessionResult>;

  readonly auth: {
    signIn(): Promise<void>;
    signOut(): Promise<void>;
    handleCallback(url: string | URL): Promise<void>;
    isCallback(url: string | URL): boolean;
    readonly isAuthenticated: boolean;
  };

  readonly integrations: {
    list(): Promise<IntegrationInfo[]>;
  };

  readonly tools: {
    list(options?: { limit?: number }): Promise<KontextTool[]>;
    execute(toolId: string, args?: Record<string, unknown>): Promise<ToolResult>;
  };

  on(event: "stateChange", handler: (state: ClientState) => void): () => void;
  on(event: "error", handler: (error: KontextError) => void): () => void;

  readonly mcp: KontextMcp;
}
```

## Auth Flow

1. Call `client.connect()` - triggers `onAuthRequired` if not authenticated
2. User is redirected to Kontext auth page
3. On callback, call `client.auth.handleCallback(window.location.href)`
4. Client state transitions to `"ready"`

```typescript
// In your callback route handler:
if (client.auth.isCallback(window.location.href)) {
  await client.auth.handleCallback(window.location.href);
}
```

## Orchestrator

`createKontextOrchestrator` is a higher-level client that auto-discovers servers:

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

Same interface as `KontextClient` but operates at the orchestration layer.

## Custom Storage

Implement `KontextStorage` for custom token persistence (e.g., database, encrypted storage):

```typescript
interface KontextStorage {
  getJson<T>(key: string): Promise<T | undefined>;
  setJson<T>(key: string, value: T | undefined): Promise<void>;
}

const client = createKontextClient({
  // ...
  storage: {
    async getJson(key) { return JSON.parse(await db.get(key)); },
    async setJson(key, value) { await db.set(key, JSON.stringify(value)); },
  },
});
```

## Connect Page

Generate a connect page URL for users to manage their integrations:

```typescript
const { connectUrl, sessionId, expiresAt } = await client.getConnectPageUrl();
// Redirect user to connectUrl
```

## Low-Level MCP Client

For direct MCP protocol access:

```typescript
import { KontextMcp } from "@kontext-dev/js-sdk/mcp";

const mcp = new KontextMcp({
  clientId: "your-app-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthRequired: (url) => { window.location.href = url.toString(); },
});

const tools = await mcp.listTools();
const result = await mcp.callTool("tool-name", { arg: "value" });

// List runtime integrations with connection status
const integrations = await mcp.listRuntimeIntegrations();
```
