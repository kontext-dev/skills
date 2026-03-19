# Integrations API Reference

Base: `https://api.kontext.dev/api/v1`

## Endpoints

### Create Integration
```
POST /integrations
```
Body:
```json
{
  "name": "GitHub",
  "url": "https://github-mcp.example.com",
  "authMode": "oauth" | "user_token" | "server_token" | "none",
  "category": "gateway_remote_mcp" | "internal_mcp_credentials",
  "capabilities": [],
  "credentialSchema": {},
  "serverToken": "..."
}
```
`capabilities`, `credentialSchema`, and `serverToken` are optional.

- `gateway_remote_mcp`: MCP integration, Kontext proxies requests via gateway
- `internal_mcp_credentials`: Kontext provides credentials, app calls API directly

### List Integrations
```
GET /integrations?limit=50&cursor=...
```

### Get Integration
```
GET /integrations/:id
```

### Update Integration
```
PATCH /integrations/:id
```
Body: `{ name?, url?, authMode? }`

### Archive Integration
```
DELETE /integrations/:id
```

### Validate Integration
```
POST /integrations/:id/validate
```
Tests MCP endpoint connectivity and returns validation results.

### Get OAuth Configuration
```
GET /integrations/:id/oauth
```

### Set OAuth Configuration
```
PUT /integrations/:id/oauth
```
Body:
```json
{
  "clientId": "gh-oauth-client",
  "clientSecret": "gh-oauth-secret",
  "authorizationUrl": "https://github.com/login/oauth/authorize",
  "tokenUrl": "https://github.com/login/oauth/access_token",
  "scopes": ["repo", "read:user"]
}
```

### Remove OAuth Configuration
```
DELETE /integrations/:id/oauth
```

### Add Personal Connection
```
POST /integrations/:id/connection
```
Body: `{ token: "ghp_..." }`

For `user_token` auth mode — user provides their own PAT/API key.

### Get Connection
```
GET /integrations/:id/connection
```
Returns: connection details, status, expiration, display name.

### Revoke Connection
```
DELETE /integrations/:id/connection
```

## Integration Object

```json
{
  "id": "uuid",
  "name": "GitHub",
  "url": "https://github-mcp.example.com",
  "authMode": "oauth",
  "category": "gateway_remote_mcp",
  "capabilities": [],
  "validationStatus": null,
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-01-15T10:30:00Z"
}
```

## Auth Mode Behaviors

| Mode | Connection Source | Token Lifecycle |
|------|-------------------|-----------------|
| `oauth` | User OAuth consent | Kontext manages refresh/revocation |
| `user_token` | User provides PAT | User manages, Kontext encrypts and stores |
| `server_token` | Org admin sets once | Shared across all users in org |
| `none` | No credentials | No token exchange needed |

## Credential Resolution

Kontext resolves OAuth credentials top-down:
1. Integration-specific OAuth config (set via API)
2. Platform-managed OAuth app (Kontext's own OAuth app for that service)

Admin overrides take priority over platform defaults.
