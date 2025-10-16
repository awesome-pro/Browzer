# Tool use with Claude
Claude is capable of interacting with tools and functions, allowing you to extend Claude’s capabilities to perform a wider variety of tasks.

Here’s an example of how to provide tools to Claude using the Messages API
```
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function main() {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    tools: [{
      name: "get_weather",
      description: "Get the current weather in a given location",
      input_schema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA"
          }
        },
        required: ["location"]
      }
    }],
    messages: [{ 
      role: "user", 
      content: "Tell me the weather in San Francisco." 
    }]
  });

  console.log(response);
}

main().catch(console.error);
```



***

## How tool use works

Claude supports two types of tools:

1. **Client tools**: Tools that execute on your systems, which include:
   * User-defined custom tools that you create and implement
   * Anthropic-defined tools like [computer use](/en/docs/agents-and-tools/tool-use/computer-use-tool) and [text editor](/en/docs/agents-and-tools/tool-use/text-editor-tool) that require client implementation

2. **Server tools**: Tools that execute on Anthropic's servers, like the [web search](/en/docs/agents-and-tools/tool-use/web-search-tool) and [web fetch](/en/docs/agents-and-tools/tool-use/web-fetch-tool) tools. These tools must be specified in the API request but don't require implementation on your part.

<Note>
  Anthropic-defined tools use versioned types (e.g., `web_search_20250305`, `text_editor_20250124`) to ensure compatibility across model versions.
</Note>

### Client tools

Integrate client tools with Claude in these steps:

<Steps>
  <Step title="Provide Claude with tools and a user prompt">
    * Define client tools with names, descriptions, and input schemas in your API request.
    * Include a user prompt that might require these tools, e.g., "What's the weather in San Francisco?"
  </Step>

  <Step title="Claude decides to use a tool">
    * Claude assesses if any tools can help with the user's query.
    * If yes, Claude constructs a properly formatted tool use request.
    * For client tools, the API response has a `stop_reason` of `tool_use`, signaling Claude's intent.
  </Step>

  <Step title="Execute the tool and return results">
    * Extract the tool name and input from Claude's request
    * Execute the tool code on your system
    * Return the results in a new `user` message containing a `tool_result` content block
  </Step>

  <Step title="Claude uses tool result to formulate a response">
    * Claude analyzes the tool results to craft its final response to the original user prompt.
  </Step>
</Steps>

Note: Steps 3 and 4 are optional. For some workflows, Claude's tool use request (step 2) might be all you need, without sending results back to Claude.

### Server tools

Server tools follow a different workflow:

<Steps>
  <Step title="Provide Claude with tools and a user prompt">
    * Server tools, like [web search](/en/docs/agents-and-tools/tool-use/web-search-tool) and [web fetch](/en/docs/agents-and-tools/tool-use/web-fetch-tool), have their own parameters.
    * Include a user prompt that might require these tools, e.g., "Search for the latest news about AI" or "Analyze the content at this URL."
  </Step>

  <Step title="Claude executes the server tool">
    * Claude assesses if a server tool can help with the user's query.
    * If yes, Claude executes the tool, and the results are automatically incorporated into Claude's response.
  </Step>

  <Step title="Claude uses the server tool result to formulate a response">
    * Claude analyzes the server tool results to craft its final response to the original user prompt.
    * No additional user interaction is needed for server tool execution.
  </Step>
</Steps>

***

## Tool use examples
Here are a few code examples demonstrating various tool use patterns and techniques. For brevity's sake, the tools are simple tools, and the tool descriptions are shorter than would be ideal to ensure best performance.
```Python Python theme={null}
      import anthropic
      client = anthropic.Anthropic()

      response = client.messages.create(
          model="claude-sonnet-4-5",
          max_tokens=1024,
          tools=[
              {
                  "name": "get_weather",
                  "description": "Get the current weather in a given location",
                  "input_schema": {
                      "type": "object",
                      "properties": {
                          "location": {
                              "type": "string",
                              "description": "The city and state, e.g. San Francisco, CA"
                          },
                          "unit": {
                              "type": "string",
                              "enum": ["celsius", "fahrenheit"],
                              "description": "The unit of temperature, either \"celsius\" or \"fahrenheit\""
                          }
                      },
                      "required": ["location"]
                  }
              }
          ],
          messages=[{"role": "user", "content": "What is the weather like in San Francisco?"}]
      )

      print(response)
      ```


    Claude will return a response similar to:

    ```JSON JSON theme={null}
    {
      "id": "msg_01Aq9w938a90dw8q",
      "model": "claude-sonnet-4-5",
      "stop_reason": "tool_use",
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "I'll check the current weather in San Francisco for you."
        },
        {
          "type": "tool_use",
          "id": "toolu_01A09q90qw90lq917835lq9",
          "name": "get_weather",
          "input": {"location": "San Francisco, CA", "unit": "celsius"}
        }
      ]
    }
    ```


You would then need to execute the `get_weather` function with the provided input, and return the result in a new `user` message:

    <CodeGroup>
      ```bash Shell theme={null}
      curl https://api.anthropic.com/v1/messages \
           --header "x-api-key: $ANTHROPIC_API_KEY" \
           --header "anthropic-version: 2023-06-01" \
           --header "content-type: application/json" \
           --data \
      '{
          "model": "claude-sonnet-4-5",
          "max_tokens": 1024,
          "tools": [
              {
                  "name": "get_weather",
                  "description": "Get the current weather in a given location",
                  "input_schema": {
                      "type": "object",
                      "properties": {
                          "location": {
                              "type": "string",
                              "description": "The city and state, e.g. San Francisco, CA"
                          },
                          "unit": {
                              "type": "string",
                              "enum": ["celsius", "fahrenheit"],
                              "description": "The unit of temperature, either \"celsius\" or \"fahrenheit\""
                          }
                      },
                      "required": ["location"]
                  }
              }
          ],
          "messages": [
              {
                  "role": "user",
                  "content": "What is the weather like in San Francisco?"
              },
              {
                  "role": "assistant",
                  "content": [
                      {
                          "type": "text",
                          "text": "I'll check the current weather in San Francisco for you."
                      },
                      {
                          "type": "tool_use",
                          "id": "toolu_01A09q90qw90lq917835lq9",
                          "name": "get_weather",
                          "input": {
                              "location": "San Francisco, CA",
                              "unit": "celsius"
                          }
                      }
                  ]
              },
              {
                  "role": "user",
                  "content": [
                      {
                          "type": "tool_result",
                          "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
                          "content": "15 degrees"
                      }
                  ]
              }
          ]
      }'
      ```

      ```Python Python theme={null}
      response = client.messages.create(
          model="claude-sonnet-4-5",
          max_tokens=1024,
          tools=[
              {
                  "name": "get_weather",
                  "description": "Get the current weather in a given location",
                  "input_schema": {
                      "type": "object",
                      "properties": {
                          "location": {
                              "type": "string",
                              "description": "The city and state, e.g. San Francisco, CA"
                          },
                          "unit": {
                              "type": "string",
                              "enum": ["celsius", "fahrenheit"],
                              "description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
                          }
                      },
                      "required": ["location"]
                  }
              }
          ],
          messages=[
              {
                  "role": "user",
                  "content": "What's the weather like in San Francisco?"
              },
              {
                  "role": "assistant",
                  "content": [
                      {
                          "type": "text",
                          "text": "I'll check the current weather in San Francisco for you."
                      },
                      {
                          "type": "tool_use",
                          "id": "toolu_01A09q90qw90lq917835lq9",
                          "name": "get_weather",
                          "input": {"location": "San Francisco, CA", "unit": "celsius"}
                      }
                  ]
              },
              {
                  "role": "user",
                  "content": [
                      {
                          "type": "tool_result",
                          "tool_use_id": "toolu_01A09q90qw90lq917835lq9", # from the API response
                          "content": "65 degrees" # from running your tool
                      }
                  ]
              }
          ]
      )

      print(response)
      ```


       This will print Claude's final response, incorporating the weather data:

    ```JSON JSON theme={null}
    {
      "id": "msg_01Aq9w938a90dw8q",
      "model": "claude-sonnet-4-5",
      "stop_reason": "stop_sequence",
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "The current weather in San Francisco is 15 degrees Celsius (59 degrees Fahrenheit). It's a cool day in the city by the bay!"
        }
      ]
    }
    ```


   Some tasks may require calling multiple tools in sequence, using the output of one tool as the input to another. In such a case, Claude will call one tool at a time. If prompted to call the tools all at once, Claude is likely to guess parameters for tools further downstream if they are dependent on tool results for tools further upstream.

    Here's an example of using a `get_location` tool to get the user's location, then passing that location to the `get_weather` tool:

    <CodeGroup>
      ```bash Shell theme={null}
      curl https://api.anthropic.com/v1/messages \
           --header "x-api-key: $ANTHROPIC_API_KEY" \
           --header "anthropic-version: 2023-06-01" \
           --header "content-type: application/json" \
           --data \
      '{
          "model": "claude-sonnet-4-5",
          "max_tokens": 1024,
          "tools": [
              {
                  "name": "get_location",
                  "description": "Get the current user location based on their IP address. This tool has no parameters or arguments.",
                  "input_schema": {
                      "type": "object",
                      "properties": {}
                  }
              },
              {
                  "name": "get_weather",
                  "description": "Get the current weather in a given location",
                  "input_schema": {
                      "type": "object",
                      "properties": {
                          "location": {
                              "type": "string",
                              "description": "The city and state, e.g. San Francisco, CA"
                          },
                          "unit": {
                              "type": "string",
                              "enum": ["celsius", "fahrenheit"],
                              "description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
                          }
                      },
                      "required": ["location"]
                  }
              }
          ],
          "messages": [{
              "role": "user",
              "content": "What is the weather like where I am?"
          }]
      }'
      ```

      ```Python Python theme={null}
      response = client.messages.create(
          model="claude-sonnet-4-5",
          max_tokens=1024,
          tools=[
              {
                  "name": "get_location",
                  "description": "Get the current user location based on their IP address. This tool has no parameters or arguments.",
                  "input_schema": {
                      "type": "object",
                      "properties": {}
                  }
              },
              {
                  "name": "get_weather",
                  "description": "Get the current weather in a given location",
                  "input_schema": {
                      "type": "object",
                      "properties": {
                          "location": {
                              "type": "string",
                              "description": "The city and state, e.g. San Francisco, CA"
                          },
                          "unit": {
                              "type": "string",
                              "enum": ["celsius", "fahrenheit"],
                              "description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
                          }
                      },
                      "required": ["location"]
                  }
              }
          ],
          messages=[{
         		  "role": "user",
          	  "content": "What's the weather like where I am?"
          }]
      )
      ```


    </CodeGroup>

    In this case, Claude would first call the `get_location` tool to get the user's location. After you return the location in a `tool_result`, Claude would then call `get_weather` with that location to get the final answer.

    The full conversation might look like:

    | Role      | Content                                                                                                                                                                                                                       |
    | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | User      | What's the weather like where I am?                                                                                                                                                                                           |
    | Assistant | I'll find your current location first, then check the weather there. \[Tool use for get\_location]                                                                                                                            |
    | User      | \[Tool result for get\_location with matching id and result of San Francisco, CA]                                                                                                                                             |
    | Assistant | \[Tool use for get\_weather with the following input]\{ "location": "San Francisco, CA", "unit": "fahrenheit" }                                                                                                               |
    | User      | \[Tool result for get\_weather with matching id and result of "59°F (15°C), mostly cloudy"]                                                                                                                                   |
    | Assistant | Based on your current location in San Francisco, CA, the weather right now is 59°F (15°C) and mostly cloudy. It's a fairly cool and overcast day in the city. You may want to bring a light jacket if you're heading outside. |

    This example demonstrates how Claude can chain together multiple tool calls to answer a question that requires gathering data from different sources. The key steps are:

    1. Claude first realizes it needs the user's location to answer the weather question, so it calls the `get_location` tool.
    2. The user (i.e. the client code) executes the actual `get_location` function and returns the result "San Francisco, CA" in a `tool_result` block.
    3. With the location now known, Claude proceeds to call the `get_weather` tool, passing in "San Francisco, CA" as the `location` parameter (as well as a guessed `unit` parameter, as `unit` is not a required parameter).
    4. The user again executes the actual `get_weather` function with the provided arguments and returns the weather data in another `tool_result` block.
    5. Finally, Claude incorporates the weather data into a natural language response to the original question.
  </Accordion>

  <Accordion title="Chain of thought tool use">
    By default, Claude Opus is prompted to think before it answers a tool use query to best determine whether a tool is necessary, which tool to use, and the appropriate parameters. Claude Sonnet and Claude Haiku are prompted to try to use tools as much as possible and are more likely to call an unnecessary tool or infer missing parameters. To prompt Sonnet or Haiku to better assess the user query before making tool calls, the following prompt can be used:

    Chain of thought prompt

    `Answer the user's request using relevant tools (if they are available). Before calling a tool, do some analysis. First, think about which of the provided tools is the relevant tool to answer the user's request. Second, go through each of the required parameters of the relevant tool and determine if the user has directly provided or given enough information to infer a value. When deciding if the parameter can be inferred, carefully consider all the context to see if it supports a specific value. If all of the required parameters are present or can be reasonably inferred, proceed with the tool call. BUT, if one of the values for a required parameter is missing, DO NOT invoke the function (not even with fillers for the missing params) and instead, ask the user to provide the missing parameters. DO NOT ask for more information on optional parameters if it is not provided.
    `
  </Accordion>

  <Accordion title="JSON mode">
    You can use tools to get Claude produce JSON output that follows a schema, even if you don't have any intention of running that output through a tool or function.

    When using tools in this way:

    * You usually want to provide a **single** tool
    * You should set `tool_choice` (see [Forcing tool use](/en/docs/agents-and-tools/tool-use/implement-tool-use#forcing-tool-use)) to instruct the model to explicitly use that tool
    * Remember that the model will pass the `input` to the tool, so the name of the tool and description should be from the model's perspective.

    The following uses a `record_summary` tool to describe an image following a particular format.

    <CodeGroup>
      ```bash Shell theme={null}
      #!/bin/bash
      IMAGE_URL="https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"
      IMAGE_MEDIA_TYPE="image/jpeg"
      IMAGE_BASE64=$(curl "$IMAGE_URL" | base64)

      curl https://api.anthropic.com/v1/messages \
           --header "content-type: application/json" \
           --header "x-api-key: $ANTHROPIC_API_KEY" \
           --header "anthropic-version: 2023-06-01" \
           --data \
      '{
          "model": "claude-sonnet-4-5",
          "max_tokens": 1024,
          "tools": [{
              "name": "record_summary",
              "description": "Record summary of an image using well-structured JSON.",
              "input_schema": {
                  "type": "object",
                  "properties": {
                      "key_colors": {
                          "type": "array",
                          "items": {
                              "type": "object",
                              "properties": {
                                  "r": { "type": "number", "description": "red value [0.0, 1.0]" },
                                  "g": { "type": "number", "description": "green value [0.0, 1.0]" },
                                  "b": { "type": "number", "description": "blue value [0.0, 1.0]" },
                                  "name": { "type": "string", "description": "Human-readable color name in snake_case, e.g. \"olive_green\" or \"turquoise\"" }
                              },
                              "required": [ "r", "g", "b", "name" ]
                          },
                          "description": "Key colors in the image. Limit to less than four."
                      },
                      "description": {
                          "type": "string",
                          "description": "Image description. One to two sentences max."
                      },
                      "estimated_year": {
                          "type": "integer",
                          "description": "Estimated year that the image was taken, if it is a photo. Only set this if the image appears to be non-fictional. Rough estimates are okay!"
                      }
                  },
                  "required": [ "key_colors", "description" ]
              }
          }],
          "tool_choice": {"type": "tool", "name": "record_summary"},
          "messages": [
              {"role": "user", "content": [
                  {"type": "image", "source": {
                      "type": "base64",
                      "media_type": "'$IMAGE_MEDIA_TYPE'",
                      "data": "'$IMAGE_BASE64'"
                  }},
                  {"type": "text", "text": "Describe this image."}
              ]}
          ]
      }'
      ```

      ```Python Python theme={null}
      import base64
      import anthropic
      import httpx

      image_url = "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"
      image_media_type = "image/jpeg"
      image_data = base64.standard_b64encode(httpx.get(image_url).content).decode("utf-8")

      message = anthropic.Anthropic().messages.create(
          model="claude-sonnet-4-5",
          max_tokens=1024,
          tools=[
              {
                  "name": "record_summary",
                  "description": "Record summary of an image using well-structured JSON.",
                  "input_schema": {
                      "type": "object",
                      "properties": {
                          "key_colors": {
                              "type": "array",
                              "items": {
                                  "type": "object",
                                  "properties": {
                                      "r": {
                                          "type": "number",
                                          "description": "red value [0.0, 1.0]",
                                      },
                                      "g": {
                                          "type": "number",
                                          "description": "green value [0.0, 1.0]",
                                      },
                                      "b": {
                                          "type": "number",
                                          "description": "blue value [0.0, 1.0]",
                                      },
                                      "name": {
                                          "type": "string",
                                          "description": "Human-readable color name in snake_case, e.g. \"olive_green\" or \"turquoise\""
                                      },
                                  },
                                  "required": ["r", "g", "b", "name"],
                              },
                              "description": "Key colors in the image. Limit to less than four.",
                          },
                          "description": {
                              "type": "string",
                              "description": "Image description. One to two sentences max.",
                          },
                          "estimated_year": {
                              "type": "integer",
                              "description": "Estimated year that the image was taken, if it is a photo. Only set this if the image appears to be non-fictional. Rough estimates are okay!",
                          },
                      },
                      "required": ["key_colors", "description"],
                  },
              }
          ],
          tool_choice={"type": "tool", "name": "record_summary"},
          messages=[
              {
                  "role": "user",
                  "content": [
                      {
                          "type": "image",
                          "source": {
                              "type": "base64",
                              "media_type": image_media_type,
                              "data": image_data,
                          },
                      },
                      {"type": "text", "text": "Describe this image."},
                  ],
              }
          ],
      )
      print(message)
      ```
</CodeGroup>
  </Accordion>
</AccordionGroup>