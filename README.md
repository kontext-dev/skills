# Kontext Skills

One public onboarding skill for Kontext v1: `get-started-with-kontext`.

## Install

```bash
npx skills add kontext-security/skills
```

Then tell your agent:

```text
Use the Get Started with Kontext skill.
```

## What It Sets Up

The skill supports exactly two paths:

| Flow | What it does |
| --- | --- |
| Claude Code on this machine | Verifies or installs `kontext-cli`, then starts Claude Code through Kontext. |
| Long-running Go agent in this repo | Creates the runtime app, lets you choose a Go setup mode in the browser, then patches supported Anthropic Go SDK repos. |

For Go agents, the browser setup offers:

| Mode | Behavior |
| --- | --- |
| Inject credentials | Removes direct `ANTHROPIC_API_KEY` usage and lets Kontext provide the Anthropic credential. |
| Trace only | Keeps the existing `ANTHROPIC_API_KEY` path and adds request/tool-call telemetry. |
