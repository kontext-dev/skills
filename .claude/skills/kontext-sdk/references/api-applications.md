# Applications API Reference

Base: `https://api.kontext.dev/api/v1`

## Endpoints

### Create Application
```
POST /applications
```
Body:
```json
{
  "name": "My Agent App",
  "oauth": {
    "type": "public" | "confidential",
    "redirectUris": ["http://localhost:3000/callback"],
    "pkceRequired": true,
    "scopes": ["openid"],
    "resourceIndicators": []
  }
}
```
`oauth.type` and `oauth.redirectUris` required. Other `oauth` fields optional.

Returns: `{ application: { ... }, oauth: { clientId, clientSecret?, ... } }`

`clientSecret` returned only on creation of confidential apps — store immediately.

### List Applications
```
GET /applications?limit=50&cursor=...
```
Returns: `{ items: [...], nextCursor? }`

### Get Application
```
GET /applications/:id
```

### Update Application
```
PATCH /applications/:id
```
Body: `{ name?, description? }`

### Archive Application
```
POST /applications/:id/archive
```
Revokes all active sessions. Non-destructive.

### Get OAuth Configuration
```
GET /applications/:id/oauth
```
Returns: `{ type, redirectUris, pkceRequired?, scopes?, resourceIndicators? }`

### Update OAuth Configuration
```
PUT /applications/:id/oauth
```
Body:
```json
{
  "type": "public" | "confidential",
  "redirectUris": ["https://..."],
  "pkceRequired": true,
  "scopes": ["openid", "profile"],
  "resourceIndicators": []
}
```

### Rotate Client Secret
```
POST /applications/:id/rotate-secret
```
Returns: `{ clientSecret }` — shown ONCE.

### Attach Integration
```
POST /applications/:id/integrations/:integrationId
```

### Detach Integration
```
DELETE /applications/:id/integrations/:integrationId
```

### List Integrations
```
GET /applications/:id/integrations
```

### Replace All Integrations
```
PUT /applications/:id/integrations
```
Body: `{ integrationIds: [...] }`

### Access Graph
```
GET /applications/:id/access-graph
```
Returns visualization data for policy analysis admin dashboards.

## Application Object

```json
{
  "id": "uuid",
  "name": "PR Reviewer",
  "description": "Reviews pull requests",
  "clientId": "app_...",
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-01-15T10:30:00Z",
  "sessions": {
    "active": 5,
    "idle": 2,
    "live": 7,
    "total": 42
  }
}
```
