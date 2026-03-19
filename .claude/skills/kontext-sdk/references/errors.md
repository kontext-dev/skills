# Kontext Error Handling

## Base Class

All SDK errors extend `KontextError`:

```typescript
import { KontextError, isKontextError } from "@kontext-dev/js-sdk";

try {
  await kontext.require("github", token);
} catch (err) {
  if (isKontextError(err)) {
    console.log(err.code);       // Error code string
    console.log(err.statusCode); // HTTP status
    console.log(err.docsUrl);    // Link to docs
    console.log(err.requestId);  // For support
    console.log(err.meta);       // Additional context
  }
}
```

Prefer `isKontextError()` over `instanceof` — works across package versions and bundler deduplication.

## Common Error Codes

| Code | Status | Meaning | Resolution |
|------|--------|---------|------------|
| `kontext_authorization_required` | 401 | User authentication needed | Initiate OAuth flow — redirect user to the authorization URL |
| `kontext_integration_connection_required` | 403 | User hasn't connected the integration | Direct user to `connectUrl` (token mode) or your app's settings flow (userId mode) |
| `kontext_oauth_token_exchange_failed` | 400 | OAuth process failed | Inspect `err.meta` for provider-specific details; check OAuth config in dashboard |
| `kontext_oauth_code_verifier_missing` | 400 | PKCE code verifier missing | PKCE state was lost (page reload, storage cleared); restart the OAuth flow from scratch |
| `kontext_rate_limited` | 429 | Rate limit exceeded | Retry after `err.retryAfter` seconds with exponential backoff |
| `kontext_network_error` | — | Connection failure | DNS, timeout, or connection refused — retry with backoff; check network connectivity |
| `kontext_config_missing_client_id` | — | Missing clientId in config | Pass `clientId` to the Kontext constructor or set the appropriate env var |
| `kontext_config_missing_redirect_uri` | — | Missing redirectUri in config | Pass `redirectUri` to `createKontextClient` config |
| `kontext_config_missing_auth_handler` | — | Missing onAuthRequired handler | Provide `onAuthRequired` callback in client config |
| `kontext_mcp_parse_error` | — | MCP message parse failure | MCP peer returned invalid JSON-RPC; check the remote MCP server |
| `kontext_mcp_invalid_request` | — | Invalid MCP request | Structurally invalid MCP request; check your request format |
| `kontext_mcp_invalid_params` | — | Invalid MCP parameters | Invalid tool arguments; validate `args` against the tool's `inputSchema` |
| `kontext_mcp_method_not_found` | — | Unknown MCP method | The method is not supported by the MCP peer; check available tools with `listTools()` |
| `kontext_mcp_internal_error` | 500 | MCP server internal error | Upstream MCP server failure; retry or check the remote server's health |
| `kontext_mcp_session_expired` | 401 | MCP session expired | Restart the MCP session by calling `connect()` again |
| `kontext_mcp_session_error` | — | MCP session error | Session-level transport failure; reconnect |
| `kontext_mcp_error` | — | General MCP error | Catch-all for MCP protocol errors; inspect `err.message` for details |
| `kontext_validation_error` | 400 | Request validation failed | Check `err.validationErrors` for field-level details |
| `kontext_policy_denied` | 403 | Policy denied access | Action blocked by org, user, or application policy layer; review policy rules |
| `kontext_not_found` | 404 | Resource not found | The integration, application, or resource does not exist; verify IDs |
| `kontext_server_error` | 500 | Server error | Kontext server failure; retry with exponential backoff |

## Specialized Error Classes

### AuthorizationRequiredError
Thrown when a valid user token is needed but not present.

```typescript
import { AuthorizationRequiredError } from "@kontext-dev/js-sdk";
// err.authorizationUrl — URL to redirect user for authentication
```

### IntegrationConnectionRequiredError
Thrown when `kontext.require()` targets an integration the user hasn't connected.

```typescript
import { IntegrationConnectionRequiredError } from "@kontext-dev/js-sdk";

try {
  await kontext.require("github", token);
} catch (err) {
  if (err instanceof IntegrationConnectionRequiredError) {
    // err.connectUrl — redirect user here to authorize (token mode only)
    // err.integration — which integration is missing
    // err.integrationId — integration ID
    // err.integrationName — integration display name
  }
}
```

### OAuthError
OAuth flow failures (invalid state, expired codes, etc.).
- `err.errorCode` — OAuth error code
- `err.errorDescription` — human-readable description

### ConfigError
SDK misconfiguration (missing clientId, invalid options).

### NetworkError
Connection failures, timeouts, DNS resolution errors.

### HttpError
Non-2xx responses from Kontext API.
- `err.statusCode` — HTTP status code
- `err.retryAfter` — seconds to wait (when rate limited)
- `err.validationErrors` — field-level errors (when 400)

## Utility Functions

```typescript
import { isNetworkError, isUnauthorizedError, translateError } from "@kontext-dev/js-sdk";

// Quick checks
if (isNetworkError(err)) { /* retry logic */ }
if (isUnauthorizedError(err)) { /* re-authenticate */ }

// Normalize errors from MCP calls or third-party wrappers
const normalized = translateError(rawError);
```

## Error Handling Patterns

### In Tool Handlers

```typescript
server.tool("my_tool", schema, async (args, { authInfo }) => {
  try {
    const cred = await kontext.require("github", authInfo.token);
    // ... use credential
  } catch (err) {
    if (err instanceof IntegrationConnectionRequiredError) {
      return {
        content: [{
          type: "text",
          text: `Please connect GitHub: ${err.connectUrl}`,
        }],
      };
    }
    throw err; // Re-throw unexpected errors
  }
});
```

### Retry Pattern

```typescript
if (isNetworkError(err) || err.statusCode === 429) {
  // Safe to retry with backoff
}
if (err.statusCode === 401 || err.statusCode === 403) {
  // Do not retry — authentication/authorization issue
}
```
