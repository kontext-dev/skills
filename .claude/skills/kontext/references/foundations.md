# Foundations: Why Agents Need Kontext

## What an Agent Actually Is

An agent is a process that calls APIs on behalf of a user, making decisions autonomously. It is neither a human (no one approves each action) nor a service account (it interprets intent dynamically, not fixed logic).

Every API call requires authentication. A single task can touch multiple services:

```typescript
// "Summarize open issues and post to #engineering"
const issues = await github.issues.listForRepo({ owner: "acme", repo: "backend", state: "open" });
const summary = await llm.summarize(issues.data);
await slack.chat.postMessage({ channel: "#engineering", text: summary });
// Needs: GitHub credential (scoped to user+repo) + Slack credential (scoped to workspace+channel)
```

## The Identity Gap

Most identity systems model humans and service accounts. Agents fit neither:

| Principal | Authentication | Decision Model | Typical Scope |
|-----------|---------------|----------------|---------------|
| Human user | Interactive login (SSO, MFA) | Human decides | Broad user permissions |
| Service account | Static secret or key | Fixed programmatic logic | Pre-provisioned system scope |
| Agent | Needs delegated credentials | Autonomous, LLM-driven | Per-user, per-task, time-limited |

There is no standard identity type for "an AI acting on behalf of Alice, read-only GitHub access, valid for 10 minutes." That gap is where most security issues begin.

## How Teams Solve It Today

Four common patterns, each with structural weaknesses:

### 1. Hardcoded API Keys

Read one token from an env var, use it for every request.

```python
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
@server.tool("list_issues")
async def list_issues(repo: str) -> str:
    gh = Github(GITHUB_TOKEN)
    return gh.get_repo(repo).get_issues(state="open")
```

**Problem**: Every caller gets the same long-lived power. No caller differentiation.

### 2. Shared Service Account

One bot account per platform, shared across agents, scripts, and pipelines.

**Problem**: Audit logs show one actor (`github-bot`) for many systems. Attribution becomes guesswork.

### 3. User Token Passthrough

Agent receives the user's OAuth token directly.

```
What task needs:                  What token grants:
- Read PRs in acme/backend        - Read/write across ALL repos
                                  - Admin capabilities the user has
                                  - Broader org/workspace access
```

**Problem**: Agent inherits user's full authority, not the task's minimum authority.

### 4. Long-Lived Personal Access Tokens

Users paste PATs into `.env`. Over time, the same token spreads across tools, scripts, and agents.

**Problem**: Broad, long-lived, hard to rotate without outages.

All four ship quickly. All fail when teams need least privilege, attribution, and controlled revocation.

## Where It Breaks

These patterns share a structural weakness: credentials are too broad, last too long, and are not attributable to a specific agent-user delegation.

### Blast radius is unlimited

A token scoped to "summarize issues in one repo" can also delete repos, read secrets, and change billing — because the token was never scoped to the task.

### Prompt injection becomes a systems attack

Without credentials, prompt injection is a content integrity issue. With credentials, it becomes an infrastructure attack — the agent performs authenticated destructive actions.

### You cannot revoke one agent

Shared credentials force all-or-nothing incident response. Revoke the token → everything breaks. Keep it → compromised agent retains access.

### No audit trail

Shared credentials collapse many actors into one identity. Logs show `github-bot` but not which agent, on whose behalf, from which prompt, under what policy.

### Credentials leak through outputs

Agents run in adversarial conditions. Credentials in process memory leak through logs, traces, exceptions, tool payloads, and generated responses.

### Overprivileged by default

Static tokens keep all original scopes for every task. A "read README" task runs with `delete_repo` permissions because the token was never narrowed.

This is why security teams block agents in production. The core risk is credential architecture.

## A Secure Agent Architecture

The fix is an identity model built for agents: scoped, auditable, and revocable.

### Agents get their own identity

Each agent is a distinct principal, not a shared bot account.

```
Before: Agent A, B, C → github-bot
After:  Agent A → agent:pr-reviewer
        Agent B → agent:issue-triage
        Agent C → agent:release-notes
```

### Users delegate explicitly

Users approve what an agent can do through OAuth 2.0 consent with PKCE. The agent receives delegated access, not the user's full session.

```
PR Reviewer is requesting access:
- Read pull requests
- Post review comments
- No org admin access
- Expires in 1 hour
```

### Credentials are scoped and short-lived

Each `kontext.require()` returns a credential scoped to the current request with its own TTL. No single long-lived secret grants access to everything.

```typescript
// BEFORE: static secret for all requests
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
server.tool("review_pr", async ({ repo, pr }) => {
  const github = new Octokit({ auth: GITHUB_TOKEN });
});

// AFTER: delegated credential per request
server.tool("review_pr", async ({ repo, pr }, { authInfo }) => {
  const github = await kontext.require("github", authInfo.token);
});
```

### Policy enforcement is centralized

Each request is evaluated across three layers — org policy, user consent, and agent permissions. All must pass before any credential is issued.

### Every action is audited

Each credential issuance and API call is logged with agent identity, delegating user, scope, target, and outcome.

### Revocation is surgical

Revoke one agent without affecting others, CI pipelines, or cron jobs. Incident response is proportional to blast radius.

### Fits your existing stack

Kontext augments existing IAM, IdP, and secrets systems. You keep existing infrastructure and add agent-aware delegation.
