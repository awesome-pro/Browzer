# Get started with Claude

> Make your first API call to Claude and build a simple web search assistant

## Prerequisites

* An Anthropic [Console account](https://console.anthropic.com/)
* An [API key](https://console.anthropic.com/settings/keys)

## Call the API

<Tabs>
  <Tab title="TypeScript">
    <Steps>
      <Step title="Set your API key">
        Get your API key from the [Claude Console](https://console.anthropic.com/settings/keys) and set it as an environment variable:

        ```bash  theme={null}
        export ANTHROPIC_API_KEY='your-api-key-here'
        ```
      </Step>

      <Step title="Install the SDK">
        Install the Anthropic TypeScript SDK:

        ```bash  theme={null}
        npm install @anthropic-ai/sdk
        ```
      </Step>

      <Step title="Create your code">
        Save this as `quickstart.ts`:

        ```typescript  theme={null}
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
        ```
      </Step>

      <Step title="Run your code">
        ```bash  theme={null}
        npx tsx quickstart.ts
        ```

        **Example output:**

        ```javascript  theme={null}
        {
          id: 'msg_01ThFHzad6Bh4TpQ6cHux9t8',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          content: [
            {
              type: 'text',
              text: 'Here are some effective search strategies to find the latest renewable energy developments:\n\n' +
                '## Search Terms to Use:\n' +
                '- "renewable energy news 2024"\n' +
                '- "clean energy breakthroughs"\n' +
                '- "solar wind technology advances"\n' +
                '- "energy storage innovations"\n' +
                '- "green hydrogen developments"\n' +
                '- "offshore wind projects"\n' +
                '- "battery technology renewable"\n\n' +
                '## Best Sources to Check:\n\n' +
                '**News & Industry Sites:**\n' +
                '- Renewable Energy World\n' +
                '- CleanTechnica\n' +
                '- GreenTech Media (now Wood Mackenzie)\n' +
                '- Energy Storage News\n' +
                '- PV Magazine (for solar)...'
            }
          ],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 21,
            output_tokens: 302
          }
        }
        ```
      </Step>
    </Steps>
  </Tab>
</Tabs>
