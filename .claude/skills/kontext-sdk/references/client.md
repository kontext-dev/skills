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

## Operating Modes

**Single-endpoint mode** — connect to one MCP server:
```typescript
const client = createKontextClient({
  clientId: "...",
  redirectUri: "...",
  url: "https://my-mcp-server.com/mcp",  // Direct connection
  onAuthRequired: (url) => { /* ... */ },
});
```

**Hybrid mode** — use Kontext gateway (aggregates tools from multiple integrations):
```typescript
const client = createKontextClient({
  clientId: "...",
  redirectUri: "...",
  // No url — uses gateway automatically
  onAuthRequired: (url) => { /* ... */ },
});
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

## Client Lifecycle

```
idle → connecting → ready
                  → needs_auth → (user authenticates) → connecting → ready
                  → failed
```

| State | Meaning |
|-------|---------|
| `idle` | Initial, not yet connected |
| `connecting` | Connection in progress |
| `ready` | Authenticated, tools available |
| `needs_auth` | User login required |
| `failed` | Connection error |

Monitor state changes:
```typescript
const unsub = client.on("stateChange", (state) => console.log(state));
client.on("error", (err) => console.error(err));
```

## Auth Flow

1. Call `client.connect()` - triggers `onAuthRequired` if not authenticated
2. User is redirected to Kontext auth page
3. On callback, call `client.auth.handleCallback(window.location.href)`
4. Client state transitions to `"ready"`

### Browser Redirect

```typescript
const client = createKontextClient({
  clientId: "...",
  redirectUri: "http://localhost:3000/callback",
  storage: localStorageAdapter(),  // Required — survives page reload
  onAuthRequired: (url) => window.location.href = url,
});

// On callback page:
if (client.auth.isCallback(window.location.href)) {
  await client.auth.handleCallback(window.location.href);
}
```

### Popup Window

```typescript
onAuthRequired: (url) => {
  const popup = window.open(url, "kontext-auth", "width=500,height=600");
  const interval = setInterval(() => {
    try {
      if (popup?.location.href.startsWith(redirectUri)) {
        client.auth.handleCallback(popup.location.href);
        popup.close();
        clearInterval(interval);
      }
    } catch {} // Cross-origin until redirect
  }, 500);
},
```

### CLI / Node.js

> **CLI/Node.js warning:** `createKontextClient` is designed for browser environments. For CLI tools, Node.js scripts, or desktop agents that connect to the Kontext MCP gateway, use the manual OAuth approach in `references/public-oauth-mcp.md` instead. The SDK does not request `scope=mcp:invoke` (required by the gateway) and has auth retry issues in non-browser contexts.

If you still need the SDK pattern in a Node.js context:

```typescript
import { createServer } from "http";
import open from "open";

onAuthRequired: (url) => {
  const server = createServer(async (req, res) => {
    const callbackUrl = `http://localhost:9876${req.url}`;
    await client.auth.handleCallback(callbackUrl);
    res.end("Authenticated! You can close this tab.");
    server.close();
  }).listen(9876);
  open(url);  // Opens browser
},
```

### Auth Methods

| Method | Description |
|--------|-------------|
| `client.auth.isAuthenticated` | Boolean — active auth session |
| `client.auth.signIn()` | Trigger OAuth flow |
| `client.auth.signOut()` | Clear tokens, return to idle |
| `client.auth.isCallback(url)` | Check if URL is OAuth callback |
| `client.auth.handleCallback(url)` | Complete OAuth exchange |

## Integration Management

```typescript
const integrations = await client.integrations.list();
// Each: { id, name, connected, connectUrl? }
```

Handle missing connections automatically:
```typescript
const client = createKontextClient({
  // ...
  onIntegrationRequired: (integration) => {
    if (integration.connectUrl) {
      window.open(integration.connectUrl);
    }
  },
});
```

## Storage

### Built-in Options

```typescript
import { localStorageAdapter, sessionStorageAdapter } from "@kontext-dev/js-sdk/client";

// Memory (default) — tokens lost on reload/exit
createKontextClient({ /* ... */ });

// localStorage — survives page reloads
createKontextClient({ storage: localStorageAdapter(), /* ... */ });

// sessionStorage — cleared when tab closes
createKontextClient({ storage: sessionStorageAdapter(), /* ... */ });
```

### Custom Storage (Interface)

Implement `KontextStorage` for custom token persistence (e.g., database, encrypted storage):

```typescript
interface KontextStorage {
  getJson<T>(key: string): Promise<T | undefined>;
  setJson<T>(key: string, value: T | undefined): Promise<void>;
}
```

### Custom Storage (Database Example)

```typescript
function createDbStorage(userId: string): KontextStorage {
  return {
    async getJson(key: string) {
      const row = await db.tokens.findUnique({ where: { userId, key } });
      return row?.value ?? null;
    },
    async setJson(key: string, value: unknown) {
      if (value === undefined) {
        await db.tokens.delete({ where: { userId, key } });
      } else {
        await db.tokens.upsert({
          where: { userId, key },
          create: { userId, key, value },
          update: { value },
        });
      }
    },
  };
}
```

### Session Namespacing

Isolate tokens for multiple users sharing storage:
```typescript
createKontextClient({
  sessionKey: "user-alice",  // Default: "default"
  // Storage keys: "kontext:<clientId>:user-alice:tokens"
});
```

### Storage Recommendations

| Context | Storage |
|---------|---------|
| Browser SPA | `localStorageAdapter()` |
| Server / multi-user | Database with user-scoped factory |
| Testing / prototypes | Default memory |
| Tab-scoped sessions | `sessionStorageAdapter()` |

## Connect Page

Generate a connect page URL for users to manage their integrations:

```typescript
const { connectUrl, sessionId, expiresAt } = await client.getConnectPageUrl();
// Redirect user to connectUrl
```

