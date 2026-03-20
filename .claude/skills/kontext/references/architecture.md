# The Three-Layer Stack

Skills, MCP, and Kontext are complementary layers — not competitors.

```
┌─────────────────────────────────────────────────────────────┐
│  SKILLS                                                     │
│  What to do                                                 │
│  ─────────────────────────────────────────────────────────  │
│  • Domain knowledge (brand voice, business rules)           │
│  • Workflows (how to triage, how to deploy)                 │
│  • Procedures (step-by-step processes)                      │
│  • Output formats (templates, schemas)                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  MCP (Model Context Protocol)                               │
│  How to access tools                                        │
│  ─────────────────────────────────────────────────────────  │
│  • Tool discovery (what's available)                        │
│  • Schema definition (what params, what returns)            │
│  • Transport (stdio, HTTP, SSE)                             │
│  • Protocol standardization (interop across tools)          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  KONTEXT                                                    │
│  Identity Control Plane                                     │
│  ─────────────────────────────────────────────────────────  │
│  • User Authorization (OAuth with PKCE, user consent)       │
│  • Secure Credentials (encrypted vault, runtime injection)  │
│  • Audit Trail (every tool call logged)                     │
│  • MCP Protocol (works with any client, any LLM)            │
└─────────────────────────────────────────────────────────────┘
```

## Why All Three?

### Skills without MCP
The agent knows *what* to do but can't *do* anything. It can write a perfect issue description but can't create the issue in Linear.

### MCP without Skills
The agent can call tools but doesn't know *when* or *how*. It has access to Linear but doesn't know your triage workflow or priority rules.

### MCP without Kontext
The agent can call tools but:
- Auth is hardcoded (`LINEAR_API_KEY=sk_live_xxx`)
- No visibility into what it's doing
- No user consent — just a static key
- No audit trail
- Works in demos, breaks in production

### The Full Stack
```
Skill: "When a user reports a bug, create a Linear issue..."
  │
  ▼
MCP: linear.create_issue(title, description, priority, team)
  │
  ▼
Kontext: User authorized → token injected → call logged → scoped access
```

## Traditional Auth vs Kontext

| Feature | Traditional | Kontext |
|---------|-------------|---------|
| Trust Anchor | Static API Key | User Consent (OAuth) |
| Credential Storage | Env var (plaintext) | Encrypted Vault (Managed) |
| Access | Permanent until revoked | Scoped & Audited |
| Scope | All or Nothing | Per-Integration |

## The Production Gap

Everyone debates Skills vs MCP. But both assume auth is solved.

**The real questions:**
- Where do credentials come from?
- Who authorized this access?
- What did the agent actually do?
- How do I revoke access?

**Kontext answers:**
- Credentials from encrypted vault, injected at runtime
- User authorized via OAuth with PKCE
- Every tool call logged with full audit trail
- Revoke per-user, per-integration, instantly

## The Narrative

> "Skills tell the agent what to do. MCP gives access to tools. Kontext handles identity — OAuth, credentials, audit — so you don't have to."

Or the one-liner:

> "Stop sharing your GH_TOKEN with robots."

## Code Comparison

```typescript
// ❌ Traditional: hardcoded key, no audit, full access forever
LINEAR_API_KEY=sk_live_xxx npx mcporter call linear.create_issue ...

// ✓ Kontext: user-consented, scoped, audited, revocable
import { KontextMcp } from '@kontext-dev/js-sdk';

const kontext = new KontextMcp({
  clientId: 'your-client-id',
  redirectUri: 'http://localhost:3333/callback',
  onAuthRequired: async (authUrl) => {
    await open(authUrl.toString());
    return await waitForCallback();
  },
});

// User authorizes once, then agent can call tools
const tools = await kontext.listTools();
const result = await kontext.callTool('github_list_repos', { owner: 'acme' });
// → Every call logged, scoped to what user authorized
```

## Control Plane vs Data Plane

The **control plane** is Kontext's hosted service. It manages identity, policy, and credential lifecycle — decides whether a request is allowed and which credentials to issue.

The **data plane** is where tool execution happens:

- **Gateway mode**: Kontext proxies requests to remote MCP servers, injecting credentials automatically
- **Credential-only mode**: Kontext brokers credentials, but your server makes the API calls directly

## Identity & Access Structure

```
Organization
 ├── Users         (identity from your existing SSO)
 └── Applications  (identity from Kontext)

User → Connection → Integration
Application → Capability → Integration (using User's Connection)
Policy → Org Layer + User Layer + Application Layer
```

## Core Objects

| Object | Description |
|--------|-------------|
| **Organization** | Top-level tenant. Provides isolation — users, apps, connections, and policies in one org cannot affect another. Maps to a company, team, or environment. |
| **User** | Human authenticated via external SSO. Establishes Connections to Integrations via OAuth. Sets delegation policies. Appears in Audit Trail as the delegating principal. |
| **Application** | Non-human agent identity issued by Kontext. Has a unique Client ID. Authenticates users via OAuth to receive access tokens. Invokes Capabilities using the user's Connections. |
| **Integration** | External service (GitHub, Slack, Linear, Stripe, custom APIs). Kontext brokers tokens issued by the integration's auth server — it does not issue them itself. |
| **Capability** | Atomic unit of access control (e.g., `github:create_issue`, `slack:send_message`). Discovered from MCP server tool definitions. Each invocation is logged. |
| **Connection** | A user's authenticated link to an integration. Created via OAuth flow or API key. Credential is issued by the integration's auth server, stored securely by Kontext, injected into app requests. |
| **Policy** | Rules across three layers (org, user, application). All three must allow. Explicit deny overrides allow at the same level. |
| **Audit Trail** | Immutable log of every capability invocation — which app, on whose behalf, which capability, on which integration, timestamp, success/failure, and policy evaluation. |

## The 3-Layer Authorization Model

Access requires permission at all three layers:

| Layer | Set by | Example |
|-------|--------|---------|
| **Org** | Admins | "Engineering org can use GitHub and Linear" |
| **User** | Users (or inherited from SSO roles) | "My applications can create issues but not delete repos" |
| **Application** | Per-application by owner or admin | "PR-Bot can only access `acme/frontend`" |

All three layers must allow. Any explicit deny at any layer blocks the request and the SDK throws `kontext_policy_denied`.
