# Agent Orchestrator - Example Usage

This document provides practical examples of using the ReAct-based agent orchestration system.

## Setup

First, ensure you have your Anthropic API key available. You can store it in environment variables or settings.

```typescript
// In your main process or settings
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'your-api-key-here';
```

## Example 1: Simple Form Automation

Automate filling out a contact form using a recorded session as reference.

```typescript
// Initialize agent for active tab
browserManager.initializeAgentOrchestrator(ANTHROPIC_API_KEY, {
  model: 'claude-sonnet-4-20250514',
  maxIterations: 10,
  maxRetries: 2,
  temperature: 0.7
});

// Execute automation
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Fill out the contact form with my information and submit it',
  recordedSession: previousContactFormRecording, // Optional: provide example
  startUrl: 'https://example.com/contact',
  expectedOutcome: 'Thank you message appears',
  constraints: [
    'Use name: John Doe',
    'Use email: john@example.com',
    'Use message: I would like to learn more about your services'
  ]
});

if (result.success) {
  console.log('✅ Form submitted successfully!');
  console.log('Steps executed:', result.executionHistory.length);
} else {
  console.error('❌ Automation failed:', result.error);
}
```

## Example 2: Login Automation

Automate login flow with error recovery.

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Log into the application using saved credentials',
  startUrl: 'https://app.example.com/login',
  expectedOutcome: 'Dashboard is displayed',
  constraints: [
    'Use username from password manager',
    'Handle 2FA if present',
    'Remember me checkbox should be checked'
  ]
});

// Monitor progress
const state = browserManager.getAgentState();
console.log('Current step:', state.currentStep);
console.log('Plan:', state.plan);
```

## Example 3: E-commerce Checkout

Complex multi-step automation with recorded session guidance.

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Add product to cart and complete checkout',
  recordedSession: previousCheckoutRecording,
  startUrl: 'https://shop.example.com/products/widget',
  expectedOutcome: 'Order confirmation page',
  constraints: [
    'Select size: Medium',
    'Select color: Blue',
    'Use shipping address from profile',
    'Use saved payment method',
    'Apply promo code: SAVE10'
  ]
});

if (result.success) {
  console.log('🎉 Order placed successfully!');
  console.log('Order details:', result.result);
} else {
  console.error('Checkout failed:', result.error);
  console.log('Completed steps:', result.executionHistory.filter(s => s.status === 'success'));
}
```

## Example 4: Data Extraction

Extract data from multiple pages.

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Extract all product names and prices from the catalog',
  startUrl: 'https://shop.example.com/catalog',
  expectedOutcome: 'All products extracted',
  constraints: [
    'Navigate through all pages',
    'Extract product name, price, and availability',
    'Store results in structured format'
  ]
});

if (result.success) {
  const products = result.result.products;
  console.log(`Extracted ${products.length} products`);
}
```

## Example 5: Form Validation Testing

Test form validation by intentionally providing invalid data.

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Test form validation by submitting invalid data',
  startUrl: 'https://example.com/signup',
  expectedOutcome: 'Validation errors are displayed',
  constraints: [
    'Try empty email field',
    'Try invalid email format',
    'Try password too short',
    'Verify error messages appear',
    'Do not actually submit valid data'
  ]
});
```

## Example 6: Using Without Recorded Session

The agent can work without recorded sessions by analyzing the current page.

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Find and click the "Get Started" button',
  startUrl: 'https://example.com',
  expectedOutcome: 'Sign up page is displayed'
});
```

## Example 7: Handling Dynamic Content

Automate interactions with dynamically loaded content.

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Load more items until all products are visible, then count them',
  startUrl: 'https://example.com/products',
  constraints: [
    'Click "Load More" button repeatedly',
    'Stop when button is disabled or no more items load',
    'Count total products displayed'
  ]
});
```

## Example 8: Multi-Tab Workflow

Automate tasks across multiple tabs (if recorded session shows tab switches).

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Compare prices across three different product pages',
  recordedSession: multiTabPriceComparisonRecording,
  startUrl: 'https://shop.example.com',
  constraints: [
    'Open product A in new tab',
    'Open product B in new tab',
    'Open product C in new tab',
    'Extract prices from all tabs',
    'Return comparison'
  ]
});
```

## Example 9: Error Recovery in Action

The agent automatically recovers from failures:

```typescript
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Submit the newsletter signup form',
  startUrl: 'https://example.com',
  constraints: [
    'Find email input (selector might change)',
    'Enter email: test@example.com',
    'Click submit button',
    'Verify success message'
  ]
});

// If initial selector fails, agent will:
// 1. Retry with same selector (up to maxRetries)
// 2. Ask Claude to replan with alternative selectors
// 3. Try different strategies (aria-label, text content, etc.)
// 4. Continue until success or max iterations reached
```

## Example 10: Monitoring Agent State

Monitor the agent's progress in real-time:

```typescript
// Start automation
const automationPromise = browserManager.executeAgentAutomation({
  userIntent: 'Complete the multi-step wizard',
  startUrl: 'https://example.com/wizard'
});

// Monitor progress
const interval = setInterval(() => {
  const state = browserManager.getAgentState();
  
  if (state) {
    console.log(`Progress: ${state.currentStep}/${state.plan?.steps.length || 0}`);
    console.log(`Iteration: ${state.iterationCount}`);
    console.log(`Errors: ${state.errors.length}`);
    
    if (state.isReplanning) {
      console.log('⚠️ Agent is replanning due to failure...');
    }
  }
}, 1000);

// Wait for completion
const result = await automationPromise;
clearInterval(interval);
```

## Example 11: Custom Configuration

Fine-tune the agent for specific use cases:

```typescript
// For simple, fast tasks - use fewer iterations
browserManager.initializeAgentOrchestrator(ANTHROPIC_API_KEY, {
  maxIterations: 5,
  maxRetries: 1,
  temperature: 0.5, // More deterministic
  thinkingBudget: 5000 // Less thinking time
});

// For complex, critical tasks - allow more iterations
browserManager.initializeAgentOrchestrator(ANTHROPIC_API_KEY, {
  maxIterations: 20,
  maxRetries: 5,
  temperature: 0.8, // More creative problem-solving
  thinkingBudget: 15000 // More thinking time
});
```

## Example 12: Integrating with Recordings Page

Use agent to replay and adapt recorded sessions:

```typescript
// Get recording from store
const recordings = browserManager.getAllRecordings();
const selectedRecording = recordings.find(r => r.name === 'Login Flow');

// Execute with adaptation
const result = await browserManager.executeAgentAutomation({
  userIntent: 'Perform the same login flow but with different credentials',
  recordedSession: selectedRecording,
  constraints: [
    'Use username: newuser@example.com',
    'Use password from environment',
    'Adapt to any UI changes since recording'
  ]
});
```

## Example 13: Handling Errors Gracefully

```typescript
try {
  const result = await browserManager.executeAgentAutomation({
    userIntent: 'Complete checkout process',
    startUrl: 'https://shop.example.com/cart'
  });
  
  if (!result.success) {
    // Analyze what went wrong
    console.error('Automation failed:', result.error);
    
    // Check which steps succeeded
    const successfulSteps = result.executionHistory.filter(s => s.status === 'success');
    console.log(`Completed ${successfulSteps.length} steps before failure`);
    
    // Get the failed step
    const failedStep = result.executionHistory.find(s => s.status === 'failed');
    if (failedStep) {
      console.log('Failed at step:', failedStep.stepNumber);
      console.log('Tool:', failedStep.toolName);
      console.log('Error:', failedStep.error);
    }
    
    // Optionally retry with different strategy
    console.log('Retrying with adjusted constraints...');
    // ... retry logic
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

## Example 14: Reset Agent Between Tasks

```typescript
// Execute first task
await browserManager.executeAgentAutomation({
  userIntent: 'Task 1',
  startUrl: 'https://example.com/task1'
});

// Reset agent to clear memory and state
browserManager.resetAgent();

// Execute second task with fresh state
await browserManager.executeAgentAutomation({
  userIntent: 'Task 2',
  startUrl: 'https://example.com/task2'
});
```

## Example 15: IPC Integration (Renderer Process)

From the renderer process, you can trigger agent automation via IPC:

```typescript
// In renderer process
import { ipcRenderer } from 'electron';

// Initialize agent
await ipcRenderer.invoke('agent:initialize', ANTHROPIC_API_KEY, {
  maxIterations: 15,
  maxRetries: 3
});

// Execute automation
const result = await ipcRenderer.invoke('agent:execute-automation', {
  userIntent: 'Fill out the form',
  startUrl: 'https://example.com/form',
  constraints: ['Use test data']
});

// Get state
const state = await ipcRenderer.invoke('agent:get-state');

// Reset
await ipcRenderer.invoke('agent:reset');

// Listen for completion events
ipcRenderer.on('agent:automation-complete', (event, result) => {
  console.log('Automation completed:', result);
});
```

## Best Practices

### 1. Provide Clear Intent
```typescript
// ❌ Vague
userIntent: 'Do the thing'

// ✅ Clear
userIntent: 'Fill out the contact form with name, email, and message, then submit'
```

### 2. Use Constraints for Specificity
```typescript
constraints: [
  'Use email: test@example.com',
  'Select country: United States',
  'Check the terms and conditions checkbox',
  'Do not submit if any validation errors appear'
]
```

### 3. Leverage Recorded Sessions
```typescript
// Recorded sessions help the agent understand:
// - Which selectors are reliable
// - The expected flow and timing
// - How to handle dynamic elements
// - Multi-step processes
```

### 4. Set Appropriate Timeouts
```typescript
// For fast pages
maxIterations: 5

// For slow/complex pages
maxIterations: 20
```

### 5. Handle Partial Success
```typescript
if (!result.success) {
  // Check if we got partial results
  const completedSteps = result.executionHistory.filter(s => s.status === 'success');
  
  if (completedSteps.length > 0) {
    // Some progress was made, maybe we can use it
    console.log('Partial completion:', completedSteps);
  }
}
```

## Troubleshooting

### Agent Not Finding Elements
- Provide a recorded session showing the correct flow
- Use more specific constraints
- Check if page structure has changed
- Increase maxIterations to allow more attempts

### Agent Stuck in Loop
- Check maxIterations setting
- Verify the expected outcome is achievable
- Review execution history to see what's repeating
- Reset agent and try with clearer constraints

### Unexpected Behavior
- Check agent state to see current plan
- Review execution history for insights
- Ensure API key is valid
- Check browser console for errors

## Performance Tips

1. **Use recorded sessions** when available - they significantly improve success rate
2. **Set appropriate iteration limits** - don't waste time on impossible tasks
3. **Provide specific constraints** - reduces ambiguity and failed attempts
4. **Reset agent between unrelated tasks** - prevents context pollution
5. **Monitor agent state** - catch issues early

## Security Considerations

1. **API Key**: Store securely, never commit to version control
2. **Credentials**: Use password manager integration, don't hardcode
3. **Sensitive Data**: Be careful with constraints containing PII
4. **Validation**: Always verify agent actions in production environments

