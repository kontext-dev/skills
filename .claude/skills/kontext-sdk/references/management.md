# Management SDK Reference

Automate applications, integrations, service accounts, sessions, and traces programmatically.

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

```typescript
mgmt.applications.create(input)        // Create app + OAuth config
mgmt.applications.list(pagination?)     // List all apps
mgmt.applications.get(id)              // Get app details
mgmt.applications.update(id, input)    // Update app name
mgmt.applications.archive(id)          // Archive app

// OAuth management
mgmt.applications.getOAuth(id)
mgmt.applications.updateOAuth(id, input)
mgmt.applications.rotateSecret(id)

// Integration attachments
mgmt.applications.listIntegrations(id)
mgmt.applications.setIntegrations(id, { integrationIds: [...] })
mgmt.applications.attachIntegration(appId, integrationId)
mgmt.applications.detachIntegration(appId, integrationId)

// Session management
mgmt.applications.revokeAllAgentSessions(id)
```

### Integrations

```typescript
mgmt.integrations.create(input)        // Create integration
mgmt.integrations.list(pagination?)     // List all
mgmt.integrations.get(id)              // Get details
mgmt.integrations.update(id, input)    // Update config
mgmt.integrations.archive(id)          // Archive
mgmt.integrations.validate(id)         // Validate connectivity
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

### Agent Sessions

```typescript
mgmt.agentSessions.list(appId, { status?, limit?, includeInactive? })
mgmt.agentSessions.get(appId, sessionId)
mgmt.agentSessions.revokeAll(appId)
```

### Traces

```typescript
mgmt.traces.list({ userId?, agentId?, applicationId?, sessionId?, limit?, offset? })
mgmt.traces.get(traceId, { userId? })
mgmt.traces.stats({ period?, userId? })
```

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
