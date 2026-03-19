# Management SDK Reference

Automate applications, integrations, service accounts, sessions, and traces programmatically.

## REST API Base

```
https://api.kontext.dev/api/v1
```

All requests require `Authorization: Bearer <token>` header (service account token or user token).

### Response Format

- Single resource: `{ "application": { ... } }`
- List: `{ "items": [...], "nextCursor"?: "..." }`
- Pagination: `limit` (1-200, default 50) + `cursor`

### Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Invalid request |
| 401 | Authentication failure |
| 403 | Insufficient permissions |
| 404 | Not found |
| 409 | Conflict |
| 429 | Rate limited |

## Install

```bash
npm install @kontext-dev/js-sdk
```

## Quick Start

```typescript
import { KontextManagementClient } from "@kontext-dev/js-sdk/management";

const mgmt = new KontextManagementClient({
  baseUrl: "https://api.kontext.dev",
  credentials: {
    clientId: "your-service-account-client-id",
    clientSecret: "your-service-account-client-secret",
  },
});

// List all applications
const { items: apps } = await mgmt.applications.list();

// Create an application
const { application, oauth } = await mgmt.applications.create({
  name: "My Agent App",
  oauth: { redirectUris: ["http://localhost:3000/callback"] },
});
```

## Config

```typescript
interface KontextManagementClientConfig {
  baseUrl: string;
  apiVersion?: string;     // default: "v1"
  tokenUrl?: string;       // default: `${baseUrl}/oauth2/token`
  scopes?: string[];       // default: ["management:all"]
  audience?: string;       // default: `${baseUrl}/api/${apiVersion}`
  credentials: {
    clientId: string;
    clientSecret: string;
  };
}
```

## Resources

### Applications

See [api-applications.md](api-applications.md) for full REST endpoint details.

```typescript
mgmt.applications.create(input)        // Create app + OAuth config
mgmt.applications.list(pagination?)     // List all apps
mgmt.applications.get(id)              // Get app details
mgmt.applications.update(id, input)    // Update app name
mgmt.applications.archive(id)          // Archive (revokes all sessions, non-destructive)

// OAuth management
mgmt.applications.getOAuth(id)         // aka getOAuthConfig
mgmt.applications.updateOAuth(id, input) // aka updateOAuthConfig
mgmt.applications.rotateSecret(id)     // Secret returned ONCE, store immediately

// Integration attachments
mgmt.applications.listIntegrations(id)
mgmt.applications.setIntegrations(id, { integrationIds: [...] })
mgmt.applications.attachIntegration(appId, integrationId)
mgmt.applications.detachIntegration(appId, integrationId)

// Session management
mgmt.applications.revokeAllAgentSessions(id)
```

### Integrations

See [api-integrations.md](api-integrations.md) for full REST endpoint details.

```typescript
mgmt.integrations.create(input)        // Create integration
mgmt.integrations.list(pagination?)     // List all
mgmt.integrations.get(id)              // Get details
mgmt.integrations.update(id, input)    // Update config
mgmt.integrations.archive(id)          // Archive
mgmt.integrations.validate(id)         // Validate MCP endpoint connectivity

// OAuth configuration (for oauth auth mode)
mgmt.integrations.setOAuthConfig(id, {
  clientId, clientSecret, authorizationUrl, tokenUrl, scopes
})

// User connections (for user_token auth mode)
mgmt.integrations.addConnection(id, { token: "..." })
mgmt.integrations.getConnectionStatus(id)
mgmt.integrations.revokeConnection(id)
```

Integration auth modes: `"oauth"`, `"user_token"`, `"server_token"`, `"none"`.

### Service Accounts

```typescript
mgmt.serviceAccounts.create({ name, description? })
mgmt.serviceAccounts.list(pagination?)
mgmt.serviceAccounts.get(id)
mgmt.serviceAccounts.rotateSecret(id)
mgmt.serviceAccounts.revoke(id)
```

#### Direct Token Request (No SDK)

```bash
curl -X POST https://api.kontext.dev/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=sa_your-id" \
  -d "client_secret=your-secret"
```

Service accounts can only access the Management API -- they cannot invoke tools or access integration credentials.

### Agent Sessions

```typescript
mgmt.agentSessions.list(applicationId, { status?, limit?, includeInactive? })
// status: "active" | "inactive" | "all" (default: "active")
// limit: default 100
mgmt.agentSessions.get(applicationId, sessionId)
// session.derivedStatus: "active" | "idle" | "expired" | "disconnected"
mgmt.agentSessions.revokeAll(applicationId)
// returns { success: boolean, disconnectedCount: number }
```

### Traces

```typescript
mgmt.traces.list({ userId?, agentId?, applicationId?, sessionId?, limit?, offset? })
mgmt.traces.get(traceId, { userId? })
// returns { trace, events }
mgmt.traces.stats({ period?, userId? })
// period: "1d" | "7d" | "30d"
```

#### Event Status Values

| Status | Meaning |
|--------|---------|
| `ok` | Successful execution |
| `warn` | Completed with warnings |
| `error_remote` | Remote server error |
| `error_proxy` | Proxy/gateway error |
| `error_auth` | Authentication/authorization failure |

### Events

```typescript
mgmt.events.list({ limit? })
```

## Authentication

The management client uses service account credentials with OAuth2 client credentials flow. Tokens are cached and auto-refreshed:

```typescript
// Manual token operations (rarely needed)
await mgmt.refreshToken();
mgmt.clearToken();
```

## Common Automation Patterns

### Bootstrap a new agent app

```typescript
// 1. Create application
const { application, oauth } = await mgmt.applications.create({
  name: "My Agent",
  oauth: { redirectUris: ["http://localhost:3000/callback"] },
});

// 2. Create/attach integrations
const { integration } = await mgmt.integrations.create({
  name: "GitHub",
  url: "https://github.com",
  authMode: "oauth",
});
await mgmt.applications.attachIntegration(application.id, integration.id);

// 3. Output credentials for .env
console.log(`KONTEXT_CLIENT_ID=${oauth.clientId}`);
console.log(`KONTEXT_CLIENT_SECRET=${oauth.clientSecret}`);
```

### Monitor agent health

```typescript
const { stats } = await mgmt.traces.stats({ period: "24h" });
console.log(`Error rate: ${stats.errorRate}%`);
console.log(`P95 latency: ${stats.latency.p95}ms`);
console.log(`Top tools:`, stats.topTools);
```
