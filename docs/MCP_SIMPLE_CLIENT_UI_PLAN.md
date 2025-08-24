# Lightweight MCP Client & Settings UI – Browzer Assistant

This document outlines a **minimal yet extensible** approach to ship MCP support inside Browzer Assistant in two weeks or fewer.

## 1. Scope (MVP)

1. **MCP Client (renderer process)**
   - Single class `McpClientManager` managing multiple server connections.
   - Supports **WebSocket** transport first (remote or localhost). StdIO can be added later.
   - Discovers tools on connect; exposes `callTool(name, args)` to the agent.

2. **Settings → MCP Servers Panel**
   - Allow users to **Add / Edit / Remove** servers.
   - Persist list in `~/.browzer/mcp.json` (global) + `./.browzer/mcp.json` (workspace).
   - Toggle server on/off & display health (🟢 / 🔴).

3. **Ask-Pipeline Hook**
   - Router picks top-K tools per query (simple keyword scoring).
   - PromptComposer injects *tiny capabilities header* for those tools.
   - Executor runs tool via `McpClientManager` and streams result back to LLM.

## 2. User Experience

1. User opens *Settings → MCP Servers*.
2. Press “➕ Add Server” → modal:
   * Name: `filesystem-local`
   * URL: `ws://localhost:7900/ws`
   * Description (optional)
3. Click **Save** → entry appears with status indicator.
4. Ask in chat: *“Read /Users/me/dev/README.md and summarise.”*
5. Behind the scenes the router selects `filesystem.read_file`, streams file, LLM answers.

## 3. Architecture Diagram (simplified)

```
Renderer (React/TS)
┌──────────────────────────────┐
│ Settings Panel (MCP)         │◄── user adds servers
└────────────┬─────────────────┘
             │persist
             ▼
    ~/.browzer/mcp.json
             │load
             ▼
┌──────────────────────────────┐
│ McpClientManager             │── callTool() │
│  • connect(serverCfg)         │◄─────────────┘
│  • listTools()                │
│  • onToolResult(id, chunk)    │
└────────────┬─────────────────┘
             │tools
             ▼
       Ask Router + LLM
```

## 4. Data Model (`mcp.json`)

```jsonc
{
  "servers": [
    {
      "name": "filesystem",
      "url": "ws://localhost:7900/ws",
      "enabled": true
    }
  ]
}
```

## 5. Implementation Steps & Timeline

| Day | Task | Owner |
|-----|------|-------|
| 1   | Install `@modelcontextprotocol/sdk` & set up `McpClientManager` skeleton | BE |
| 2   | Implement WebSocket connect, heartbeat, listTools caching | BE |
| 3   | Create JSON persistence helper (`config-store.ts`) | BE |
| 4-5 | Build Settings panel (React) with Add/Edit/Delete, validation | FE |
| 6   | Wire panel to persistence; reload McpClientManager on save | FE |
| 7   | Implement simple Router (keyword match) + PromptComposer | BE |
| 8   | Hook Ask pipeline: inject header & execute tool calls | BE |
| 9   | Basic telemetry + health pings in UI | FE |
| 10  | QA with filesystem demo server; bug-bash | QA |
| 11-12 | Docs + release alpha build | PM |

## 6. Key Code Sketches

### 6.1 McpClientManager

```ts
// src/renderer/services/McpClientManager.ts
import { Client } from "@modelcontextprotocol/sdk/client";
import { WebSocketTransport } from "@modelcontextprotocol/sdk/transports/ws";

export class McpClientManager {
  private servers = new Map<string, Client>();
  private toolIndex: Record<string, { server: string; schema: any }> = {};

  async connect(cfg: { name: string; url: string }) {
    const transport = new WebSocketTransport({ url: cfg.url });
    const client = new Client({ name: "browzer" }, transport);
    await client.connect();
    this.servers.set(cfg.name, client);

    const tools = await client.listTools();
    for (const t of tools) this.toolIndex[`${cfg.name}.${t.name}`] = { server: cfg.name, schema: t.inputSchema };
  }

  listTools() { return Object.keys(this.toolIndex); }

  async callTool(fullName: string, args: any) {
    const entry = this.toolIndex[fullName];
    if (!entry) throw new Error("Tool not found");
    return this.servers.get(entry.server)!.callTool(fullName.split(".")[1], args);
  }
}
```

### 6.2 Settings Panel (React snippet)

```tsx
// src/renderer/components/McpSettings.tsx
export function McpSettings() {
  const [servers, setServers] = useStore("mcp.servers", []);

  function add() { /* open modal; push into array; save */ }
  function toggle(i: number) { servers[i].enabled = !servers[i].enabled; save(); }
  function remove(i: number) { servers.splice(i,1); save(); }

  return (
    <section>
      <h2>MCP Servers</h2>
      <button onClick={add}>Add Server</button>
      {servers.map((s,i)=>(
        <div key={i}>
          <span>{s.name}</span>
          <input type="checkbox" checked={s.enabled} onChange={()=>toggle(i)}/>
          <button onClick={()=>remove(i)}>❌</button>
        </div>
      ))}
    </section>
  );
}
```

## 7. Risks & Mitigations

- **Unreachable server** → show ⚠️ status; auto-retry with backoff.
- **Prompt-bloat** → limit to top-3 tools header.
- **Security** → warn before connecting to non-localhost WS; future: token auth.

## 8. Stretch Goals (post-MVP)

- StdIO transport for local child-process servers.
- Embedding-based router for smarter tool selection.
- Multi-step ReAct planning loop.
- Export/Import server presets.

---

*Draft ‑ Aug 2025*
