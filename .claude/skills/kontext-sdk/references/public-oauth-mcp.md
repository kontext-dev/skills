# Public OAuth + MCP Gateway Guide

Connect a CLI tool, Node.js script, or desktop agent to the Kontext MCP gateway using OAuth + PKCE as a public client.

## When to Use This Guide

- Building a CLI tool or Node.js script that connects to Kontext's MCP gateway
- Using a non-browser runtime where `createKontextClient` cannot redirect the user
- Connecting to `https://api.kontext.dev/mcp` as a public client (no client secret)

## Critical Requirements

These are **mandatory** for a working connection. The SDK does not handle them automatically for CLI/Node.js environments.

| Parameter | Value | Why |
|-----------|-------|-----|
| `scope` | `mcp:invoke` | **Without this, the JWT `aud` claim is empty and the gateway returns `invalid_token`.** This is the #1 cause of auth failures. |
| `resource` | `https://api.kontext.dev/mcp` | Must match the MCP gateway endpoint. Used in both the authorization request and token exchange. |
| `redirect_uri` | `http://localhost:<port>/callback` | Must be registered in the Kontext dashboard for your app. |

## Dashboard Setup

Before writing code:

1. **Create an application** in the Kontext dashboard (public client type)
2. **Set redirect URI** to `http://localhost:<port>/callback` (e.g., `http://localhost:19284/callback`)
3. **Attach integrations** (e.g., NotionMCP) to the application — set auth mode to `oauth`
4. **Copy the OAuth Client ID** (format: `app_<uuid>`)

For integration OAuth config (e.g., Notion):

| Field | Example value |
|-------|---------------|
| Provider | `notion` (or Custom) |
| Provider ID | `notion` |
| Check "Use your own developer credentials" | If you have your own Notion OAuth app from [notion.so/my-integrations](https://www.notion.so/my-integrations) |

## Why Not `createKontextClient`?

The SDK's `createKontextClient` has issues in CLI/Node.js environments:

1. **Missing `mcp:invoke` scope** — The SDK's internal OAuth provider does not request this scope. Tokens are issued with an empty `aud` claim, causing `invalid_token` errors on every MCP gateway request.
2. **`onAuthRequired` fires multiple times** — The SDK's `connect()` retries auth internally. If the first token is rejected (due to missing scope), it triggers `onAuthRequired` again with new PKCE state, but the callback server may have already served the old state.
3. **No `sessionId` in older SDK versions** — The gateway requires `clientInfo.sessionId` in the MCP initialize handshake.

**Recommended approach**: Handle OAuth manually, then use `@modelcontextprotocol/sdk` Client directly.

## Complete Implementation

### 1. OAuth Flow

```typescript
import { createServer } from "node:http";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import open from "open";

const REDIRECT_PORT = 19284;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const RESOURCE = "https://api.kontext.dev/mcp";
const SCOPE = "mcp:invoke";

function base64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function doOAuthFlow(clientId: string): Promise<string> {
  // 1. Discover endpoints
  const asm = await fetch(
    "https://api.kontext.dev/.well-known/oauth-authorization-server"
  ).then(r => r.json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
  };

  // 2. Generate PKCE
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest()
  );
  const state = randomUUID();

  // 3. Build authorization URL
  const authUrl = new URL(asm.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("resource", RESOURCE);  // REQUIRED
  authUrl.searchParams.set("scope", SCOPE);         // REQUIRED

  // 4. Start callback server, then open browser
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname === "/callback") {
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400).end("State mismatch");
          server.close();
          reject(new Error("OAuth state mismatch"));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Authenticated! Close this tab.</h2></body></html>");
        server.close();
        resolve(url.searchParams.get("code")!);
      }
    });
    server.listen(REDIRECT_PORT, () => open(authUrl.toString()));
    server.on("error", reject);
  });

  // 5. Exchange code for token
  const tokenRes = await fetch(asm.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier,
      resource: RESOURCE,
    }).toString(),
  });

  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json() as { access_token: string };
  return access_token;
}
```

### 2. Connect to MCP Gateway

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = await doOAuthFlow(clientId);

const transport = new StreamableHTTPClientTransport(
  new URL("https://api.kontext.dev/mcp"),
  {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  }
);

// sessionId is required by the gateway
const client = new Client(
  { name: "my-agent", version: "0.1.0", sessionId: randomUUID() } as any,
  { capabilities: {} } as any
);

await client.connect(transport);

// List tools from connected integrations
const { tools } = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: "notion:search",
  arguments: { query: "meeting notes" },
});
```

### 3. Token Caching

Cache the token to avoid re-auth on every run:

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const TOKEN_DIR = join(homedir(), ".my-agent");
const TOKEN_FILE = join(TOKEN_DIR, "token.json");

interface CachedToken {
  access_token: string;
  expires_in: number;
  obtained_at: number;
}

async function getCachedToken(): Promise<string | null> {
  try {
    const data: CachedToken = JSON.parse(await readFile(TOKEN_FILE, "utf-8"));
    const expiresAt = data.obtained_at + (data.expires_in - 60) * 1000;
    if (Date.now() < expiresAt) return data.access_token;
  } catch {}
  return null;
}

async function cacheToken(access_token: string, expires_in: number) {
  await mkdir(TOKEN_DIR, { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify({
    access_token, expires_in, obtained_at: Date.now(),
  }));
}
```

## Verifying Your Token

Decode the JWT payload to confirm it has the right claims:

```typescript
const payload = JSON.parse(
  Buffer.from(token.split(".")[1], "base64url").toString()
);
console.log("aud:", payload.aud); // Should be "https://api.kontext.dev/mcp" or contain it
console.log("scp:", payload.scp); // Should include "mcp:invoke"
```

**If `aud` is `[]` (empty)**: You forgot `scope=mcp:invoke` in the authorization request.
**If `aud` is a string but gateway returns 401**: Check that it matches the gateway URL.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_token` (401) | Empty `aud` in JWT | Add `scope=mcp:invoke` to auth request |
| `invalid_token` (401) | Wrong `resource` in token exchange | Use `resource=https://api.kontext.dev/mcp` in both auth and token exchange |
| `initialize requires clientInfo.sessionId` | Missing `sessionId` in MCP client info | Add `sessionId: randomUUID()` to Client constructor |
| `OAuth state validation failed` | Stale callback URL from previous auth attempt | Each auth attempt needs a fresh callback server with its own state |
| `redirect_uri does not match` | Redirect URI not registered in dashboard | Add `http://localhost:<port>/callback` to app's Callback URLs in dashboard |
| `Not Acceptable` (406) | Missing Accept headers | Use `StreamableHTTPClientTransport` which sets them automatically |
| `onAuthRequired` fires twice | SDK retries after first token rejected | Use manual OAuth instead of `createKontextClient` for CLI apps |

## Dependencies

```bash
npm install @modelcontextprotocol/sdk open
```

- `@modelcontextprotocol/sdk` — MCP client and transport
- `open` — Opens the auth URL in the user's default browser
- `@kontext-dev/js-sdk` — **Not required** for this approach (OAuth is manual)
