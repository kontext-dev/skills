# Production Deployment Checklist

## 1. Factory Functions

Always pass a factory function to `kontext.middleware()`:

```typescript
// CORRECT — new server per session
app.use(kontext.middleware(() => createServer()));

// WRONG — shared instance breaks concurrent sessions
const server = createServer();
app.use(kontext.middleware(server));
```

The MCP specification mandates a 1:1 relationship between server instances and transport connections.

## 2. Client Secret

Set via environment variable:
```bash
KONTEXT_CLIENT_SECRET=your-secret
```

Or in code:
```typescript
const kontext = new Kontext({
  clientId: "...",
  clientSecret: "your-secret",
});
```

Enables: server-side token operations, session tracking, telemetry. Optional but strongly recommended.

## 3. Token Issuer

If your OAuth server uses a different issuer from public metadata:

```bash
KONTEXT_TOKEN_ISSUER=https://your-issuer.com
# Multiple issuers (comma-separated):
KONTEXT_TOKEN_ISSUER=https://issuer1.com,https://issuer2.com
```

Or in code:
```typescript
const kontext = new Kontext({
  clientId: "...",
  tokenIssuer: ["https://issuer1.com", "https://issuer2.com"],
});
```

## 4. Reverse Proxy

When behind a reverse proxy, set `resourceServerUrl` to your public endpoint:

```typescript
app.use(kontext.middleware(() => createServer(), {
  resourceServerUrl: "https://api.myapp.com",
}));
```

Without this, OAuth protected resource metadata will contain incorrect internal URLs.

## 5. Session Management

Sessions inactive for 1 hour are automatically cleaned up every 5 minutes. No manual configuration needed.

Monitor sessions with hooks:
```typescript
app.use(kontext.middleware(() => createServer(), {
  onSessionInitialized: (sessionId, authInfo, transport) => {
    console.log(`Session started: ${sessionId}`);
  },
  onSessionClosed: (sessionId) => {
    console.log(`Session ended: ${sessionId}`);
  },
}));
```

## 6. Graceful Shutdown

The SDK automatically registers handlers for `SIGINT` and `SIGTERM`.

For dynamic instance creation (e.g., serverless), call `destroy()` explicitly:

```typescript
const kontext = new Kontext({ clientId: "..." });

// When done:
await kontext.destroy();
// Disconnects all sessions, clears credential caches,
// removes instance from global shutdown handler set
```

## 7. Credential Caching

The SDK implements built-in LRU caching for credentials returned by `kontext.require()`:

- **Max entries**: 500
- **TTL**: Minimum of (token expiry minus 60 seconds) or 5 minutes
- **Separate buckets**: Token-mode and userId-mode exchanges use separate cache keys — no collisions
- **No configuration needed**: Caching is automatic and transparent

The cache is cleared when `kontext.destroy()` is called.

## 8. Body Size Limits

The middleware defaults to `1mb` request body limit. Override for large tool payloads:

```typescript
app.use(kontext.middleware(() => createServer(), {
  bodyLimit: "5mb",
}));
```

## 9. Metadata Transform for Proxies

When behind a reverse proxy, in addition to `resourceServerUrl`, use `metadataTransform` to rewrite all URLs in OAuth metadata responses:

```typescript
app.use(kontext.middleware(() => createServer(), {
  resourceServerUrl: "https://api.myapp.com",
  metadataTransform: (metadata) => ({
    ...metadata,
    // Rewrite any internal URLs to public-facing addresses
    authorization_endpoint: metadata.authorization_endpoint.replace(
      "http://internal:3000", "https://api.myapp.com"
    ),
  }),
}));
```

## 10. Environment Variables Summary

| Variable | Purpose | Required |
|----------|---------|----------|
| `KONTEXT_CLIENT_ID` | Application identifier | Yes (or pass in code) |
| `KONTEXT_CLIENT_SECRET` | Server-side operations | Recommended |
| `KONTEXT_TOKEN_ISSUER` | Custom token issuer URL(s) | If non-standard issuer |

## Production Readiness Checklist

- [ ] Factory function used for `kontext.middleware()` (not a shared instance)
- [ ] `KONTEXT_CLIENT_SECRET` set in environment
- [ ] `KONTEXT_TOKEN_ISSUER` configured if using non-standard OAuth issuer
- [ ] `resourceServerUrl` set when behind reverse proxy or load balancer
- [ ] `dangerouslyOmitAuth` is **not** set (or explicitly `false`)
- [ ] Session hooks wired for observability (`onSessionInitialized`, `onSessionClosed`)
- [ ] Graceful shutdown handled — `kontext.destroy()` called for dynamic/serverless instances
- [ ] Error handling covers `IntegrationConnectionRequiredError` in all tool handlers
- [ ] `bodyLimit` configured appropriately for expected payload sizes
- [ ] Secrets stored in environment variables, not in code or version control
