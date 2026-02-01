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
│  How to do it safely                                        │
│  ─────────────────────────────────────────────────────────  │
│  • Auth (OAuth, tokens, credentials)                        │
│  • Permissions (what the agent can access)                  │
│  • Observability (see every call, latency, success/fail)    │
│  • Governance (policies, approvals, audit trails)           │
│  • Revocation (kill access instantly when needed)           │
└─────────────────────────────────────────────────────────────┘
```

## Why All Three?

### Skills without MCP
The agent knows *what* to do but can't *do* anything. It can write a perfect issue description but can't create the issue in Linear.

### MCP without Skills
The agent can call tools but doesn't know *when* or *how*. It has access to Linear but doesn't know your triage workflow or priority rules.

### MCP without Kontext
The agent can call tools but:
- Auth is hardcoded or missing
- No visibility into what it's doing
- No way to revoke access
- No audit trail
- Works in demos, breaks in production

### The Full Stack
```
Skill: "When a user reports a bug, create a Linear issue with priority based on severity..."
  │
  ▼
MCP: linear.create_issue(title, description, priority, team)
  │
  ▼
Kontext: OAuth handled, call logged, scoped to issues.write, revocable
```

## The Production Gap

Everyone debates Skills vs MCP. But neither works in production without solving:

| Problem | Demo Mode | Production |
|---------|-----------|------------|
| Auth | Hardcoded API key | OAuth with refresh, per-agent tokens |
| Permissions | Full access | Scoped by task, least privilege |
| Visibility | Console.log | Dashboard, alerts, audit trail |
| Revocation | Restart the agent | Instant, granular, cascading |
| Compliance | "Trust me" | Audit logs, approval workflows |

**Kontext closes this gap.**

## The Narrative

> "Skills tell the agent what to do. MCP gives the agent access to tools. Kontext makes sure those tools are safe to use in production."

Or shorter:

> "Skills vs MCP is the wrong debate. The real question is: how do you ship either one to production?"
