# Agent Module - ReAct-based LLM Orchestration

This module implements sophisticated ReAct (Reasoning + Acting) based browser automation orchestration using Claude Sonnet 4.5.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentOrchestrator                         │
│  • Main ReAct loop controller                                │
│  • Planning and replanning                                   │
│  • Error recovery and self-debugging                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼────────┐  ┌───────▼────────┐
│ SessionAnalyzer│  │ ExecutionEngine│
│ • Analyze      │  │ • Execute tools│
│   recordings   │  │ • Validation   │
│ • Extract      │  │ • Verification │
│   patterns     │  │                │
└────────────────┘  └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ MemoryManager  │
                    │ • Conversation │
                    │ • Context      │
                    │ • History      │
                    └────────────────┘
```

## Components

### 1. AgentOrchestrator

The main orchestrator that implements the ReAct loop:

**Phases:**
1. **Planning**: Analyze intent + recorded session → Generate action plan
2. **Execution**: Execute tools sequentially with real-time context
3. **Reflection**: Verify results, detect failures
4. **Recovery**: Self-debug and replan if needed

**Key Features:**
- Extended thinking for complex planning
- Multi-step execution with context awareness
- Automatic error recovery and replanning
- Maximum iteration limits to prevent infinite loops
- Comprehensive execution history tracking

**Usage:**
```typescript
const orchestrator = new AgentOrchestrator(view, {
  apiKey: 'your-anthropic-api-key',
  model: 'claude-sonnet-4-20250514',
  maxIterations: 15,
  maxRetries: 3,
  temperature: 0.7,
  thinkingBudget: 10000
});

const result = await orchestrator.executeAutomation({
  userIntent: 'Fill out the contact form and submit',
  recordedSession: previousRecording,
  startUrl: 'https://example.com/contact',
  expectedOutcome: 'Thank you message appears'
});
```

### 2. SessionAnalyzer

Analyzes recorded sessions to extract actionable patterns:

**Capabilities:**
- Action sequence analysis
- Selector pattern extraction
- Navigation flow understanding
- Form interaction patterns
- Multi-tab workflow detection
- Timing and reliability insights

**Output:**
- Human-readable narrative for LLM context
- Structured insights for programmatic use
- Recommendations for automation strategy

**Usage:**
```typescript
const analyzer = new SessionAnalyzer();
const narrative = await analyzer.analyzeSession(recordedSession);
// Returns comprehensive analysis in markdown format
```

### 3. ExecutionEngine

Manages tool execution with context awareness:

**Features:**
- Pre-execution validation
- Fresh context before each step
- Post-execution verification
- Stability waiting (DOM/network settle)
- Execution metrics and timing

**Usage:**
```typescript
const engine = new ExecutionEngine(toolRegistry, contextProvider);
const result = await engine.executeStep(step, currentContext);
```

### 4. MemoryManager

Manages conversation history following Anthropic best practices:

**Features:**
- Proper message role alternation
- Tool result formatting
- Context window management
- Automatic history pruning
- Import/export for persistence

**Usage:**
```typescript
const memory = new MemoryManager();
memory.addUserMessage('Automate login');
memory.addToolResult('click_element', params, result);
const messages = memory.getMessages(); // For Claude API
```

## ReAct Loop Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PLANNING PHASE                                            │
│    • Analyze user intent                                     │
│    • Review recorded session (if provided)                   │
│    • Get current browser context                             │
│    • Generate step-by-step plan using Claude + thinking      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. EXECUTION PHASE                                           │
│    FOR EACH STEP:                                            │
│    • Get fresh browser context                               │
│    • Validate step can execute                               │
│    • Execute tool via ToolRegistry                           │
│    • Wait for page stability                                 │
│    • Capture result                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. REFLECTION PHASE                                          │
│    • Check if step succeeded                                 │
│    • Verify expected outcome                                 │
│    • Update execution history                                │
│    • Detect errors or unexpected states                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
          ┌───────┴────────┐
          │ Success?       │
          └───┬────────┬───┘
              │ YES    │ NO
              │        │
              ▼        ▼
         ┌────────┐  ┌──────────────────────────────────────┐
         │ Next   │  │ 4. RECOVERY PHASE                     │
         │ Step   │  │    • Retry with same parameters?      │
         └────────┘  │    • Max retries exceeded?            │
                     │    • Call Claude to replan            │
                     │    • Generate new strategy            │
                     │    • Update remaining steps           │
                     │    • Continue execution               │
                     └──────────────────────────────────────┘
```

## Error Recovery Strategy

The agent implements sophisticated error recovery:

### Level 1: Simple Retry
- Retry same action up to `maxRetries` times
- Useful for timing issues or transient failures

### Level 2: Replanning
- When retries exhausted, ask Claude to replan
- Provide:
  - Failed step details
  - Error message
  - Current browser state
  - Execution history
- Claude generates new approach

### Level 3: Graceful Failure
- If replanning fails, return detailed error
- Include execution history for debugging
- Preserve partial results

## Integration with Anthropic Claude

### Model Configuration

Uses Claude Sonnet 4.5 (latest as of Oct 2025):
```typescript
model: 'claude-sonnet-4-20250514'
```

### Extended Thinking

Enables extended thinking for complex planning:
```typescript
thinking: {
  type: 'enabled',
  budget_tokens: 10000
}
```

This allows Claude to reason deeply about:
- Complex multi-step workflows
- Selector strategies
- Error recovery approaches
- Alternative execution paths

### Tool Use Format

Follows Anthropic's tool use best practices:
- Tools defined in MCP format
- Proper parameter validation
- Clear descriptions and examples
- Structured error responses

### Prompt Engineering

System prompts include:
- Clear role definition
- Available capabilities
- Planning guidelines
- Execution guidelines
- Error recovery strategies
- Output format specifications

## Best Practices

### 1. Planning
- Break complex tasks into atomic steps
- Use specific, reliable selectors
- Include verification steps
- Plan for common failures

### 2. Execution
- Always get fresh context before actions
- Verify elements exist before interaction
- Use appropriate waits and timeouts
- Check for errors after each step

### 3. Error Handling
- Provide detailed error messages
- Include browser state in error context
- Suggest alternative approaches
- Learn from recorded sessions

### 4. Performance
- Limit max iterations to prevent infinite loops
- Use efficient context extraction
- Prune conversation history
- Cache stable context data

## Example: Complete Automation Flow

```typescript
import { AgentOrchestrator } from '@/main/automation/agent';

// 1. Initialize orchestrator
const orchestrator = new AgentOrchestrator(webContentsView, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514',
  maxIterations: 15,
  maxRetries: 3
});

// 2. Prepare automation request
const request = {
  userIntent: 'Log into the application and navigate to settings',
  recordedSession: previousLoginRecording, // Optional
  startUrl: 'https://app.example.com/login',
  expectedOutcome: 'Settings page is displayed',
  constraints: [
    'Use saved credentials',
    'Handle 2FA if present'
  ]
};

// 3. Execute automation
const result = await orchestrator.executeAutomation(request);

// 4. Handle result
if (result.success) {
  console.log('✅ Automation completed successfully');
  console.log('Steps executed:', result.executionHistory.length);
  console.log('Final result:', result.result);
} else {
  console.error('❌ Automation failed:', result.error);
  console.log('Execution history:', result.executionHistory);
}
```

## Monitoring and Debugging

### Get Agent State
```typescript
const state = orchestrator.getState();
console.log('Current step:', state.currentStep);
console.log('Plan:', state.plan);
console.log('Errors:', state.errors);
console.log('Iterations:', state.iterationCount);
```

### Memory Statistics
```typescript
const stats = memoryManager.getStats();
console.log('Messages:', stats.messageCount);
console.log('Estimated tokens:', stats.estimatedTokens);
```

### Execution Statistics
```typescript
const toolStats = toolRegistry.getAllStats();
console.log('Tool usage:', toolStats);
```

## Future Enhancements

- [ ] Parallel tool execution for independent actions
- [ ] Learning from successful/failed executions
- [ ] Custom tool definitions for domain-specific tasks
- [ ] Visual verification using screenshots
- [ ] Multi-agent collaboration for complex workflows
- [ ] Persistent memory across sessions
- [ ] A/B testing different automation strategies

## References

- [Anthropic Tool Use Documentation](https://docs.claude.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

