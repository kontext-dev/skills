# Credential Vault Setup Guide

Use credential vault mode when your app has its own users and auth system, and you want Kontext to manage third-party credentials (GitHub, Slack, etc.) on their behalf — server-to-server, no user token in the loop.

## How It Works (Two Phases)

**Phase 1 — Connect (one-time per user per integration):**
Your app redirects the user to a Kontext connect page. The user authorizes (e.g., "Allow access to GitHub"). Kontext stores the credential, linked to your user ID.

**Phase 2 — Use (ongoing):**
Your backend calls `kontext.require("github", { userId })`. Kontext returns a fresh access token. No user interaction needed.

The catch: Phase 1 requires Kontext to trust that your app is who it says it is, and that the user ID is real. That's where external auth comes in.

## Plain-English: What Are JWKS and JWT?

**JWT (JSON Web Token)** — A signed JSON blob. Your backend creates it, signs it with a private key, and sends it to Kontext. Kontext can verify the signature without knowing your private key, because you publish the matching public key.

**JWKS (JSON Web Key Set)** — A public URL that serves your public key(s) in a standard format. Kontext fetches this URL to get the key it needs to verify your JWTs. That's it — it's just a public key endpoint.

**Issuer** — A URL that identifies who signed the token. Kontext checks that the `iss` claim in the JWT matches what you configured.

**Audience** — A string that says "this token is meant for Kontext." Prevents tokens meant for other services from being accepted.

The flow:
1. Your backend signs a short-lived JWT with your private key
2. Kontext fetches your JWKS URL to get the public key
3. Kontext verifies the signature, issuer, and audience
4. If valid, Kontext trusts the `sub` (subject) claim as the user ID

## What You Need

### From your auth provider

| Value | What it is | Where to find it |
|-------|-----------|-----------------|
| **JWKS URL** | Public key endpoint | Your auth provider's docs or `.well-known/openid-configuration` |
| **Issuer** | The URL that identifies your auth system | Same as above — usually the base URL of your auth provider |

### From Kontext (you configure these)

| Value | What it is |
|-------|-----------|
| **Application ID** | Your Kontext app ID |
| **Partner API Key** | Secret key for the connect session API |
| **Client ID + Secret** | For `kontext.require()` calls |
| **Audience** | A string you pick — must match in both your JWT and Kontext config |

### Finding Values for Common Auth Providers

**Clerk:**
- JWKS URL: `https://<your-clerk-domain>/.well-known/jwks.json`
- Issuer: `https://<your-clerk-domain>`
- Your Clerk dashboard shows both under "API Keys" > "Advanced"

**Auth0:**
- JWKS URL: `https://<your-tenant>.auth0.com/.well-known/jwks.json`
- Issuer: `https://<your-tenant>.auth0.com/`
- Found in your Auth0 tenant settings

**WorkOS:**
- JWKS URL: `https://api.workos.com/sso/jwks/<your-client-id>`
- Issuer: `https://api.workos.com`

**Convex Auth (`@convex-dev/auth`):**
- JWKS URL: `https://<your-deployment>.convex.site/.well-known/jwks.json`
- Issuer: Your `CONVEX_SITE_URL` (e.g., `https://<your-deployment>.convex.site`)
- These endpoints are auto-exposed by `auth.addHttpRoutes(http)` — you already have them
- The keys come from the `JWT_PRIVATE_KEY` / `JWKS` env vars you set up during Convex Auth configuration

**NextAuth.js / Auth.js:**
- If using a JWT strategy, you need to expose your own JWKS endpoint
- NextAuth doesn't expose one by default — you'd need a custom route

**Supabase Auth:**
- JWKS URL: `https://<your-project>.supabase.co/auth/v1/.well-known/jwks.json`
- Issuer: `https://<your-project>.supabase.co/auth/v1`

**Firebase Auth:**
- JWKS URL: `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
- Issuer: `https://securetoken.google.com/<your-project-id>`

**Rolling your own (no auth provider with JWKS):**
If your auth system doesn't expose a JWKS endpoint, you need to add one. It's ~30 lines:
1. Generate an RSA or EC key pair
2. Sign JWTs with the private key
3. Serve the public key at `/.well-known/jwks.json`

```typescript
// Generate keys (run once, store securely)
import { generateKeyPair, exportJWK } from "jose";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = await exportJWK(publicKey);
// Store privateKey securely, serve publicJwk at /.well-known/jwks.json

// Serve JWKS endpoint
app.get("/.well-known/jwks.json", (req, res) => {
  res.json({ keys: [{ ...publicJwk, kid: "my-key-1", use: "sig", alg: "RS256" }] });
});

// Sign a JWT for the connect session
import { SignJWT, importJWK } from "jose";
const key = await importJWK(privateJwkFromSecureStorage, "RS256");
const jwt = await new SignJWT({ sub: userId })
  .setProtectedHeader({ alg: "RS256", kid: "my-key-1" })
  .setIssuer("https://your-app.com")
  .setAudience("your-kontext-audience")
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(key);
```

## Phase 1: Creating a Connect Session

When a user needs to connect an integration for the first time, your backend creates a partner connect session:

```typescript
// Your backend — e.g., an API route or server action
async function createConnectSession(userId: string) {
  // 1. Sign a short-lived JWT identifying this user
  const jwt = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "RS256", kid: "my-key-1" })
    .setIssuer("https://your-app.com")        // Must match your Kontext config
    .setAudience("your-kontext-audience")       // Must match your Kontext config
    .setIssuedAt()
    .setExpirationTime("5m")                    // Keep it short
    .sign(privateKey);

  // 2. Request a connect session from Kontext
  const res = await fetch("https://api.kontext.dev/partner/connect-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.KONTEXT_PARTNER_API_KEY!,
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      applicationId: process.env.KONTEXT_APP_ID!,
      returnUrl: "https://your-app.com/settings", // Where to redirect after connect
    }),
  });

  const { connectUrl } = await res.json();
  return connectUrl; // Redirect the user here
}
```

The JWT claims Kontext verifies:
- `iss` — must match your configured issuer
- `sub` — your stable user ID (this becomes the `userId` for credential vault)
- `aud` — must match your configured audience
- `exp` — must not be expired
- Any extra claims if you configured `requiredClaims`

## Phase 2: Fetching Credentials

Once the user has connected, your backend fetches credentials with no user interaction:

```typescript
import { Kontext } from "@kontext-dev/js-sdk/server";

const kontext = new Kontext({
  clientId: "your-kontext-client-id",
  // clientSecret auto-read from KONTEXT_CLIENT_SECRET env var
});

// Fetch GitHub credentials for this user
const cred = await kontext.require("github", { userId: "your-platform-user-id" });

const res = await fetch("https://api.github.com/user/repos", {
  headers: { Authorization: cred.authorization },
});
```

## Handling "Not Connected Yet"

When a user hasn't connected an integration, `kontext.require()` throws `IntegrationConnectionRequiredError`. In credential vault mode, this error does **not** include a `connectUrl` (there's no user session). Your app needs to handle this by creating a connect session:

```typescript
import { IntegrationConnectionRequiredError } from "@kontext-dev/js-sdk/errors";

try {
  const cred = await kontext.require("github", { userId });
} catch (err) {
  if (err instanceof IntegrationConnectionRequiredError) {
    // No connectUrl in userId mode — create a partner connect session instead
    const connectUrl = await createConnectSession(userId);
    // Return this URL to your frontend so the user can connect
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KONTEXT_CLIENT_ID` | Your Kontext application client ID |
| `KONTEXT_CLIENT_SECRET` | Your Kontext application client secret |
| `KONTEXT_PARTNER_API_KEY` | Partner API key for connect session creation |
| `KONTEXT_APP_ID` | Your Kontext application ID (for connect session requests) |

## Checklist

1. **Pick your auth provider** — Clerk, Auth0, Convex Auth, Firebase, or roll your own
2. **Find your JWKS URL and issuer** — see the provider table above
3. **Configure external auth in Kontext** — set issuer, JWKS URL, audience, allowed algorithms
4. **Get your partner API key** from Kontext
5. **Build the connect flow** — create a backend route that signs a JWT and calls `/partner/connect-session`
6. **Handle `IntegrationConnectionRequiredError`** — redirect to connect when a user hasn't authorized yet
7. **Use `kontext.require(integration, { userId })`** — fetch credentials server-to-server
