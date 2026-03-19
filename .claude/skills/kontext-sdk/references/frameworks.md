# Framework Integrations Reference

Adapters for Vercel AI SDK, React, and Cloudflare Agents.

## Table of Contents

- [Vercel AI SDK](#vercel-ai-sdk)
- [React](#react)
- [Cloudflare Agents](#cloudflare-agents)
- [Cloudflare + React](#cloudflare--react)

## Vercel AI SDK

Convert Kontext tools into Vercel AI SDK `CoreTool` format.

### Install

```bash
npm install @kontext-dev/js-sdk ai
```

### Usage

```typescript
import { createKontextClient } from "@kontext-dev/js-sdk/client";
import { toKontextTools } from "@kontext-dev/js-sdk/ai";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const client = createKontextClient({
  clientId: "your-app-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthRequired: (url) => { /* handle auth */ },
});

await client.connect();

// Convert Kontext tools to Vercel AI SDK format
const { tools, systemPrompt, integrations } = await toKontextTools(client);

// Use with any AI model
const result = await generateText({
  model: openai("gpt-4o"),
  system: systemPrompt,
  tools,
  prompt: "List my GitHub repositories",
});
```

### Types

```typescript
interface ToKontextToolsOptions {
  formatResult?: (result: ToolResult) => unknown;
}

interface KontextToolsResult {
  readonly tools: Record<string, CoreTool>;        // Pass to generateText/streamText
  readonly systemPrompt: string;                    // Inject as system message
  readonly integrations: readonly IntegrationInfo[];// Check connection status
}
```

### Streaming

```typescript
import { streamText } from "ai";

const stream = streamText({
  model: openai("gpt-4o"),
  system: systemPrompt,
  tools,
  prompt: userMessage,
  maxSteps: 5,
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Custom Result Formatting

```typescript
const { tools } = await toKontextTools(client, {
  formatResult: (result) => {
    return JSON.stringify(result);
  },
});
```

### Multi-Step Workflows

`maxSteps: 5` covers most multi-tool workflows. Increase for complex chains.

---

## React

React hooks and provider for managing Kontext auth state in the browser.

### Install

```bash
npm install @kontext-dev/js-sdk react
```

### KontextProvider

Wrap your app to provide Kontext context:

```tsx
import { KontextProvider } from "@kontext-dev/js-sdk/react";

function App() {
  return (
    <KontextProvider
      popupFeatures="width=600,height=700"
      onAuthComplete={() => console.log("Auth complete")}
    >
      <YourApp />
    </KontextProvider>
  );
}
```

### useKontext Hook

Access auth state and MCP update handlers:

```tsx
import { useKontext } from "@kontext-dev/js-sdk/react";

function MyComponent() {
  const { authenticating, onMcpUpdate, handleElicitationUrl } = useKontext();

  if (authenticating) return <div>Authenticating...</div>;

  return <div>Ready</div>;
}
```

### OAuth Flow

1. Provider detects auth needed
2. Popup opens to Kontext authorization page
3. User signs in and consents
4. Backend handles OAuth callback with token exchange
5. Popup closes, session resumes

No redirect handlers or callback routes needed — popups handle everything.

### Integration Connection Popups

When a tool requires an unconnected integration:

```tsx
// handleElicitationUrl from useKontext opens a popup for the specific integration
handleElicitationUrl(connectUrl);
```

### useKontextContext

Access the same context from deeper components:

```tsx
import { useKontextContext } from "@kontext-dev/js-sdk/react";

function DeepChild() {
  const { authenticating } = useKontextContext();
  // ...
}
```

### Types

```typescript
interface UseKontextOptions {
  popupFeatures?: string;     // default: "width=600,height=700"
  onAuthComplete?: () => void;
}

interface UseKontextReturn {
  authenticating: boolean;
  onMcpUpdate: (data: McpState) => void;
  handleElicitationUrl: (url: string) => void;
}
```

---

## Cloudflare Agents

Integrate Kontext into Cloudflare Workers using the `withKontext` mixin.

### Install

```bash
npm install @kontext-dev/js-sdk agents
```

### withKontext Mixin

Apply to your Agent class to add Kontext identity, OAuth handling, and tool proxying:

```typescript
import { Agent } from "agents";
import { withKontext } from "@kontext-dev/js-sdk/cloudflare";

// Environment must include KONTEXT_CLIENT_ID
export class MyAgent extends withKontext(Agent) {
  async onStart() {
    await super.onStart();
    // Kontext is now initialized
  }

  async chat(message: string) {
    // Get Kontext-proxied tools as AI SDK ToolSet
    const tools = await this.kontextTools();

    // Access the generated system prompt
    const systemPrompt = this.kontextSystemPrompt;

    // Use tools with your AI model...
  }
}
```

### What withKontext Adds

- `kontextTools(): Promise<ToolSet>` - Returns Kontext tools as executable AI SDK tools
- `kontextSystemPrompt: string` - Generated system prompt describing available tools
- `createMcpOAuthProvider(callbackUrl: string)` - Creates an OAuth provider for custom callback handling
- Auto-handles OAuth callbacks and MCP connection lifecycle
- Manages Durable Object storage for tokens
- Broadcasts MCP state updates to connected clients

### KontextCloudflareOAuthProvider

Lower-level OAuth provider for custom flows:

```typescript
import { KontextCloudflareOAuthProvider } from "@kontext-dev/js-sdk/cloudflare";

const provider = new KontextCloudflareOAuthProvider({
  kontextClientId: "your-app-client-id",
  storage: ctx.storage,
  agentName: "my-agent",
  callbackUrl: "https://your-worker.dev/callback",
});
```

### DurableObjectKontextStorage

Adapts Cloudflare Durable Object storage to `KontextStorage` interface:

```typescript
import { DurableObjectKontextStorage } from "@kontext-dev/js-sdk/cloudflare";

const storage = new DurableObjectKontextStorage(ctx.storage);
```

### Lifecycle Hooks

`withKontext` integrates at three Agent lifecycle points:
1. **Connection handling** — OAuth redirects
2. **Startup** — Configuration initialization
3. **Request delegation** — MCP transport and OAuth callbacks

### Environment Variables

Set `KONTEXT_CLIENT_ID` in your `wrangler.toml`:

```toml
[vars]
KONTEXT_CLIENT_ID = "your-app-client-id"
# Optional: override API base URL
# KONTEXT_SERVER_URL = "https://custom-api.example.com"
```

---

## Cloudflare + React

React hooks specifically for Cloudflare Agents frontend.

### Install

```bash
npm install @kontext-dev/js-sdk react agents
```

### useKontextAgent

Drop-in replacement for `useAgent` that auto-handles Kontext auth:

```tsx
import { useKontextAgent } from "@kontext-dev/js-sdk/react/cloudflare";
import { KontextProvider } from "@kontext-dev/js-sdk/react/cloudflare";

function App() {
  return (
    <KontextProvider>
      <Chat />
    </KontextProvider>
  );
}

function Chat() {
  const { agent, send, ready } = useKontextAgent({
    agent: "my-agent",
    name: "session-1",
  });

  return <div>...</div>;
}
```

### Types

```typescript
type UseKontextAgentOptions<State> = Omit<UseAgentOptions<State>, "onMcpUpdate">;

interface UseKontextAgentReturn<State> {
  agent: string;
  name: string;
  identified: boolean;
  ready: Promise<void>;
  setState: (state: State) => void;
  call: <T>(method: string, args?: unknown[]) => Promise<T>;
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: WebSocket["addEventListener"];
  removeEventListener: WebSocket["removeEventListener"];
}
```

`useKontextAgent` wraps `useAgent` and automatically pipes `onMcpUpdate` through the `KontextProvider` context, handling OAuth popups and elicitation URLs transparently.

---

## Peer Dependencies

| Framework | Required Packages |
|-----------|-------------------|
| React | `react` (^18.0.0 or ^19.0.0) |
| Vercel AI | `ai` (^4.0.0) |
| Cloudflare | `agents` (>=0.4.0) |
| All | `@kontext-dev/js-sdk`, `@modelcontextprotocol/sdk` (^1.26.0) |
