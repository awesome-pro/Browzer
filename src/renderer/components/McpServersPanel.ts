import { McpClientManager, McpServerConfig } from '../services/McpClientManager';

/**
 * Lightweight UI helper that injects an MCP Servers section into the Settings page.
 * Requires a <div id="mcp-servers-root"></div> placeholder within settings.html.
 */
export class McpServersPanel {
  private root: HTMLElement;
  private manager: McpClientManager;

  constructor(root: HTMLElement, manager: McpClientManager) {
    this.root = root;
    this.manager = manager;
    this.render();
  }

  private render() {
    const cfgs = this.manager.loadConfigs();
    this.root.innerHTML = `
      <h3 class="settings-card-title">
        <span class="settings-icon">🔌</span> MCP Servers
      </h3>
      <p class="settings-card-description">Connect Browzer to external tool servers (Model Context Protocol)</p>
      <div class="mcp-server-list">
        ${cfgs.map((c, i) => this.renderRow(c, i)).join('')}
      </div>
      <button id="mcp-add-btn" class="chrome-btn chrome-btn-primary">Add Server</button>
    `;

    this.root.querySelector('#mcp-add-btn')?.addEventListener('click', () => this.showAddModal());
    cfgs.forEach((_c, idx) => {
      this.root.querySelector(`#toggle-${idx}`)?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.manager.toggleServer(cfgs[idx].name, checked);
      });
      this.root.querySelector(`#remove-${idx}`)?.addEventListener('click', () => {
        const list = this.manager.loadConfigs();
        list.splice(idx,1);
        this.manager.saveConfigs(list);
        this.render();
      });
    });
  }

  private renderRow(c: McpServerConfig, i: number) {
    return `
      <div class="mcp-row">
        <span class="mcp-name">${c.name}</span>
        <span class="mcp-url">${c.url}</span>
        <label class="mcp-toggle">
          <input type="checkbox" id="toggle-${i}" ${c.enabled ? 'checked' : ''}>
          <span>Enabled</span>
        </label>
        <button id="remove-${i}" class="chrome-btn chrome-btn-danger chrome-btn-small">Remove</button>
      </div>
    `;
  }

  private showAddModal() {
    const name = prompt('Server name (unique id)');
    if (!name) return;
    const url = prompt('WebSocket URL (e.g., ws://localhost:7900/ws)');
    if (!url) return;
    const cfg: McpServerConfig = { name, url, enabled: true };
    this.manager.addConfig(cfg);
    this.render();
  }
}
