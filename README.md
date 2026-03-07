# Kontext Skills

Skills for Kontext.dev workflows and SDK integration.

## Install

```bash
npx skills add kontext-dev/skills
```

Auto-detects your AI harness (Claude Code, Cursor, Gemini CLI, etc.) and installs to the right location.

## Public Skills

### kontext-sdk

Integrate the Kontext identity control plane into TypeScript applications using `@kontext-dev/js-sdk`.

**Triggers on**: Imports of `@kontext-dev/js-sdk`, mentions of Kontext SDK, or requests to add identity/credential management to AI agent architectures.

**Covers**: Server SDK (Express + MCP), Client SDK (auth flows), Vercel AI SDK adapter, React hooks, Cloudflare Agents, and Management API.
