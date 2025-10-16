npm install @anthropic-ai/sdk

// quickstart.ts
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const anthropic = new Anthropic();

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: "What should I search for to find the latest developments in renewable energy?"
      }
    ]
  });
  console.log(msg);
}

main().catch(console.error);


// TS SDK
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'my_api_key', // defaults to process.env["ANTHROPIC_API_KEY"]
});

const msg = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude" }],
});
console.log(msg);

// Claude 4 Models
"claude-opus-4-1-20250805"
"claude-opus-4-1"  // alias
"claude-opus-4-20250514"
"claude-opus-4-0"  // alias
"claude-sonnet-4-5-20250929"
"claude-sonnet-4-5"  // alias
"claude-sonnet-4-20250514"
"claude-sonnet-4-0"  // alias
"claude-haiku-4-5-20251001"
"claude-haiku-4-5"  // alias





// Streaming Messages
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

await client.messages.stream({
    messages: [{role: 'user', content: "Hello"}],
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
}).on('text', (text) => {
    console.log(text);
});


Event types
Each server-sent event includes a named event type and associated JSON data. Each event will use an SSE event name (e.g. event: message_stop), and include the matching event type in its data.
Each stream uses the following event flow:
message_start: contains a Message object with empty content.
A series of content blocks, each of which have a content_block_start, one or more content_block_delta events, and a content_block_stop event. Each content block will have an index that corresponds to its index in the final Message content array.
One or more message_delta events, indicating top-level changes to the final Message object.
A final message_stop event.





// Prompt Caching
```
Prompt caching is a powerful feature that optimizes your API usage by allowing resuming from specific prefixes in your prompts. This approach significantly reduces processing time and costs for repetitive tasks or prompts with consistent elements.
Here’s an example of how to implement prompt caching with the Messages API using a cache_control block:
```
```
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: "You are an AI assistant tasked with analyzing literary works. Your goal is to provide insightful commentary on themes, characters, and writing style.\n",
    },
    {
      type: "text",
      text: "<the entire contents of 'Pride and Prejudice'>",
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: [
    {
      role: "user",
      content: "Analyze the major themes in 'Pride and Prejudice'."
    }
  ]
});
console.log(response.usage);

// Call the model again with the same inputs up to the cache checkpoint
const new_response = await client.messages.create(...)
console.log(new_response.usage);
```


How prompt caching works
When you send a request with prompt caching enabled:
The system checks if a prompt prefix, up to a specified cache breakpoint, is already cached from a recent query.
If found, it uses the cached version, reducing processing time and costs.
Otherwise, it processes the full prompt and caches the prefix once the response begins.
This is especially useful for:
Prompts with many examples
Large amounts of context or background information
Repetitive tasks with consistent instructions
Long multi-turn conversations
By default, the cache has a 5-minute lifetime. The cache is refreshed for no additional cost each time the cached content is used.