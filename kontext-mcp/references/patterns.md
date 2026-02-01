# MCP + Kontext Patterns

Common patterns for using MCP servers through Kontext governance.

## Pattern 1: Connect → Observe → Control

The basic Kontext flow for any MCP server:

```
1. CONNECT
   ┌─────────────────────────────────────────────┐
   │ Kontext handles OAuth for the MCP server    │
   │ • No redirect flows to build                │
   │ • No secrets in your codebase               │
   │ • Tokens managed and refreshed automatically│
   └─────────────────────────────────────────────┘
                        │
                        ▼
2. OBSERVE
   ┌─────────────────────────────────────────────┐
   │ Every MCP tool call flows through Kontext   │
   │ • See what was called, when, by whom        │
   │ • Latency, success/failure, payloads        │
   │ • Real-time dashboard + historical audit    │
   └─────────────────────────────────────────────┘
                        │
                        ▼
3. CONTROL
   ┌─────────────────────────────────────────────┐
   │ Apply policies before calls execute         │
   │ • Scope access (read-only, specific repos)  │
   │ • Require approvals for sensitive actions   │
   │ • Rate limits, cost controls                │
   │ • Revoke access instantly                   │
   └─────────────────────────────────────────────┘
```

## Pattern 2: Skill-Driven MCP Calls

A skill defines *what* to do; MCP + Kontext handle *how*:

```markdown
# Bug Triage Skill

## Workflow
1. User reports a bug
2. Assess severity (P0-P3) based on impact
3. Create Linear issue with appropriate priority
4. Notify team in Slack if P0/P1

## MCP Calls (via Kontext)
- linear.create_issue → governed, scoped to project
- slack.post_message → governed, scoped to #incidents
```

The skill doesn't handle auth or permissions — Kontext does.

## Pattern 3: Multi-Tool Workflows

Agent workflows often span multiple MCP servers:

```
┌──────────────────────────────────────────────────────────┐
│ Skill: "Deploy and notify"                               │
│                                                          │
│ 1. github.create_pull_request                            │
│ 2. github.merge_pull_request (requires approval)         │
│ 3. vercel.deploy                                         │
│ 4. slack.post_message                                    │
│ 5. linear.update_issue                                   │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Kontext: Single governance layer                         │
│                                                          │
│ • One OAuth flow per service (not per agent)             │
│ • Unified audit trail across all tools                   │
│ • Policy: "merge requires human approval"                │
│ • All calls visible in one dashboard                     │
└──────────────────────────────────────────────────────────┘
```

## Pattern 4: Scoped Access Per Task

Traditional MCP gives the agent full access to a service. Kontext enables task-scoped tokens:

```
Without Kontext:
  Agent gets: github.* (all repos, all actions)

With Kontext:
  Agent gets: github.issues.write on repo:acme/frontend
              Expires: 1 hour
              Revocable: if parent task cancelled
```

This is "least privilege" for agents.

## Pattern 5: Approval Workflows

Some MCP calls should require human approval:

```yaml
# Kontext policy
policies:
  - match: "github.delete_*"
    action: require_approval
    approvers: ["@security-team"]

  - match: "stripe.refund"
    action: require_approval
    condition: "amount > 100"

  - match: "*"
    action: allow
    log: true
```

The agent can request the action; Kontext gates execution.

## Pattern 6: Observability-First

Every MCP call through Kontext is observable:

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard View                                          │
├─────────────────────────────────────────────────────────┤
│ Agent: deploy-bot                                       │
│ Session: abc-123                                        │
│                                                         │
│ 14:32:01  github.get_pull_request  ✓  120ms            │
│ 14:32:02  github.list_checks       ✓   89ms            │
│ 14:32:03  github.merge             ⏳ awaiting approval │
│ 14:32:15  github.merge             ✓  340ms  (approved)│
│ 14:32:16  vercel.deploy            ✓ 2.1s              │
│ 14:32:18  slack.post_message       ✓   45ms            │
└─────────────────────────────────────────────────────────┘
```

No more "what did the agent do?" — you can see and replay everything.

## Anti-Patterns

### ❌ Hardcoded credentials in skills
```markdown
# Bad: credentials in skill
Use LINEAR_API_KEY=sk_live_xxx to call Linear...
```

### ✓ Delegate auth to Kontext
```markdown
# Good: skill assumes auth is handled
Call linear.create_issue through Kontext. Auth is managed.
```

### ❌ Full access for convenience
```markdown
# Bad: agent has access to everything
Connect to GitHub with repo:* scope
```

### ✓ Scope to what's needed
```markdown
# Good: least privilege
Connect to GitHub with issues:write on acme/frontend only
```

### ❌ No visibility
```markdown
# Bad: agent runs, hope it worked
Agent completed. Check Linear manually to verify.
```

### ✓ Observable by default
```markdown
# Good: every call logged
Agent completed. 3 calls made, 3 succeeded. View in dashboard.
```
