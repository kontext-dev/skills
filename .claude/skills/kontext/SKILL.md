---
name: kontext
description: Understand what Kontext is and get routed to the right skill. Use when the user asks "what is Kontext?", "which Kontext skill should I use?", "how do I get started with Kontext?", wants to understand Kontext's architecture, or needs help choosing between kontext-sdk, kontext-sdk-credentials, and kontext-byoa-setup. Also triggers on questions about agent identity, agent credentials, securing AI applications with OAuth, MCP integration, or Kontext positioning.
---

# Kontext

Kontext is the **Identity Control Plane for AI Applications**. It handles OAuth, credential vaulting, and audit trails so developers can focus on building agent logic.

**The problem**: Every team building AI applications hits the same wall — agents need access to external services, but hardcoding API keys is insecure, managing OAuth is painful, and security teams block deployment because there's no visibility.

**The solution**: Stop sharing your GH_TOKEN with robots. Kontext provides secure, just-in-time credentials for AI applications to access user data — scoped, audited, and revocable.

**The tagline**: "You handle the logic; we handle OAuth, credential vaulting, and audit trails."

## The Three-Layer Stack

```
Skills   → What to do (knowledge, workflows, procedures)
MCP      → How to access tools (protocol, discovery, schemas)
Kontext  → Identity control plane (OAuth, credentials, audit)
```

See [architecture.md](references/architecture.md) for the full diagram.

## What Kontext Actually Does

Kontext sits between your AI applications and external integrations (GitHub, Linear, Slack, your APIs):

| Capability | What It Means |
|------------|---------------|
| **User Authorization** | OAuth with PKCE — users consent to what agents can access |
| **Secure Credentials** | Tokens stored in encrypted vault, injected at runtime |
| **Audit Trail** | Every tool call is logged |
| **MCP Protocol** | Works with any MCP client, any LLM framework |

### Traditional Auth vs Kontext

| Feature | Traditional | Kontext |
|---------|-------------|---------|
| Trust Anchor | Static API Key | User Consent (OAuth) |
| Credential Storage | Env var (plaintext) | Encrypted Vault |
| Access | Permanent until revoked | Scoped & Audited |
| Scope | All or Nothing | Per-Integration |

## Public vs Confidential Clients

Kontext supports two OAuth client types:

| | Public Client | Confidential Client |
|---|---|---|
| **Use case** | CLI tools, browser apps, desktop agents | Server-side apps with secure backends |
| **Client Secret** | None — uses PKCE instead | Required — stored server-side |
| **Auth flow** | Authorization Code + PKCE | Authorization Code + client secret |
| **Example** | Claude Code skill, Codex agent, React app | Backend service calling Kontext API |

## Core Concepts

These terms appear across all Kontext skills:

| Concept | What it means |
|---------|---------------|
| **Organization** | Tenant isolation at the company/team/environment level. |
| **User** | Human authenticated via external SSO who establishes OAuth connections and sets delegation policies. |
| **Application** | Non-human agent identity issued by Kontext — acts on users' behalf through delegated access. |
| **Integration** | External service connected through Kontext (GitHub, Linear, Slack, custom APIs). |
| **Auth mode** | How an integration authenticates: `oauth`, `user_token`, `server_token`, or `none`. |
| **Connection** | A user's authenticated link to an integration — created via OAuth or API key. |
| **Capability** | Atomic unit of access control (e.g., `github:create_issue`, `slack:send_message`). |
| **Service account** | Machine identity for programmatic access to the Management API (CI/CD, automation). Not an application. |
| **Gateway mode** | Kontext proxies MCP requests and injects credentials automatically. |
| **Credential-only mode** | App exchanges tokens via `kontext.require()`, then calls APIs directly. |

## Skill Map

| Skill | Purpose | Use when... |
|-------|---------|-------------|
| `/kontext-sdk` | SDK implementation | Integrating `@kontext-dev/js-sdk` into TypeScript apps — client OAuth flows, server credential exchange, React hooks, Vercel AI adapter, Cloudflare Agents, Management SDK |
| `/kontext-sdk-credentials` | Server-side credential lifecycle | Creating confidential apps, managing integrations (oauth, user_token, server_token, none), calling `Kontext.require(...)` with clientId + clientSecret + userId |
| `/kontext-byoa-setup` | Bring Your Own Auth | Configuring JWT trust (issuer, JWKS, audience) so apps with existing login systems skip double-auth, creating BYOA API keys, hosted connect sessions |

## Decision Tree

```
What do you need?
│
├─ "Explain Kontext" / "How does agent auth work?" / "Compare to API keys"
│  → This skill handles it (see above + references/)
│
├─ "Add Kontext to my app" / "Integrate the SDK"
│  │
│  ├─ Public client?
│  │  │
│  │  ├─ Browser app (React, Next.js, SPA)?
│  │  │  → /kontext-sdk (client SDK path — createKontextClient)
│  │  │
│  │  └─ CLI tool, Node.js script, or desktop agent connecting to MCP gateway?
│  │     → /kontext-sdk (public-oauth-mcp reference — manual OAuth + PKCE)
│  │     ⚠️  Do NOT use createKontextClient for CLI/Node.js — it lacks
│  │        scope=mcp:invoke and has auth retry bugs in non-browser contexts
│  │
│  ├─ Server-side app with its own backend?
│  │  │
│  │  ├─ App has its own login system (Clerk, Auth0, Convex, etc.)?
│  │  │  → /kontext-byoa-setup first, then /kontext-sdk-credentials
│  │  │
│  │  └─ No existing auth / new app?
│  │     → /kontext-sdk (server SDK path)
│  │
│  └─ React / Vercel AI / Cloudflare Agents?
│     → /kontext-sdk (framework adapters)
│
├─ "Set up a confidential app" / "Manage integrations" / "Kontext.require()"
│  → /kontext-sdk-credentials
│
├─ "Configure BYOA" / "JWT trust" / "JWKS" / "hosted connect"
│  → /kontext-byoa-setup
│
├─ "Automate Kontext from CI" / "Management API" / "Service accounts"
│  → /kontext-sdk (Management SDK section)
│
└─ Not sure?
   → Read the concepts above, then pick an implementation skill
```

## How the Skills Relate

```
/kontext (concepts + routing)
  "What is Kontext? How does it work? Where do I start?"
       │
       ▼
/kontext-sdk (implementation)
  "Add Kontext to my TypeScript app"
       │
       ├──────────────────────┐
       ▼                      ▼
/kontext-sdk-credentials   /kontext-byoa-setup
  "Server-side credential     "My app has its own
   retrieval & integration     login system — skip
   management"                 double-auth"
```

## For Skill Developers

If you're building skills that use MCP servers, Kontext means:

1. **No API keys in skills** — Don't embed `LINEAR_API_KEY` in your skill
2. **User-consented access** — The user authorizes once, agent gets scoped tokens
3. **Automatic audit** — Every tool call logged without extra code
4. **Runtime injection** — Credentials injected when needed, not stored in code

See [patterns.md](references/patterns.md) for concrete examples.

## When Explaining Kontext

1. **Start with the problem** — "Every team hits the same wall: agents need access but API keys are insecure"
2. **The one-liner** — "Stop sharing your GH_TOKEN with robots"
3. **What it does** — OAuth, credential vaulting, audit trails
4. **The comparison** — Static keys vs user consent, env vars vs encrypted vault
5. **For developers** — "You handle the logic; we handle the auth"

## References

- **Foundations**: See [foundations.md](references/foundations.md) — why agents need credentials, how teams solve it today (4 anti-patterns), where it breaks (6 failure modes), and the secure agent architecture
- **Architecture**: See [architecture.md](references/architecture.md) — three-layer stack, core objects, 3-layer authorization model, control plane vs data plane
- **Integration patterns**: See [patterns.md](references/patterns.md) — credential-free skills, user authorization flow, multi-integration patterns
- **Full docs**: https://docs.kontext.dev
