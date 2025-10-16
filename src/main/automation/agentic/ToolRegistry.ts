/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ToolRegistry - Defines all tools available to Claude for browser automation
 * 
 * Following Anthropic's tool use best practices:
 * - Clear, descriptive tool names
 * - Detailed descriptions with examples
 * - Well-structured input schemas
 * - Proper error handling guidance
 */

import Anthropic from '@anthropic-ai/sdk';

export class ToolRegistry {
  /**
   * Get all available tools for Claude
   */
  public static getTools(): Anthropic.Tool[] {
    return [
      // Navigation
      {
        name: 'navigate',
        description: 'Navigate the browser to a specific URL. Use this to go to a new page or refresh the current page.',
        input_schema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The full URL to navigate to (must include protocol, e.g., https://github.com)'
            }
          },
          required: ['url']
        }
      },
      
      // Element interaction
      {
        name: 'click',
        description: 'Click on an element. Supports multiple selector strategies including CSS selectors and text-based matching. Use :contains() for text matching (e.g., "button:contains(\'Submit\')").',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector or text-based selector. Examples: "#submit-btn", "button:contains(\'Create repository\')", "a[href=\'/login\']"'
            },
            description: {
              type: 'string',
              description: 'Human-readable description of what you\'re clicking (for logging)'
            }
          },
          required: ['selector', 'description']
        }
      },
      
      {
        name: 'type',
        description: 'Type text into an input field or textarea. Automatically handles React forms and triggers all necessary events.',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the input element'
            },
            text: {
              type: 'string',
              description: 'The text to type into the field'
            },
            clear: {
              type: 'boolean',
              description: 'Whether to clear existing text before typing (default: true)'
            }
          },
          required: ['selector', 'text']
        }
      },
      
      {
        name: 'select',
        description: 'Select an option from a dropdown/select element.',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the select element'
            },
            value: {
              type: 'string',
              description: 'The value or text of the option to select'
            }
          },
          required: ['selector', 'value']
        }
      },
      
      // Waiting and verification
      {
        name: 'wait_for_element',
        description: 'Wait for an element to appear on the page. Use this before interacting with dynamically loaded elements.',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector or text-based selector for the element to wait for'
            },
            timeout: {
              type: 'number',
              description: 'Maximum time to wait in milliseconds (default: 10000)'
            }
          },
          required: ['selector']
        }
      },
      
      {
        name: 'wait',
        description: 'Wait for a specified amount of time. Use sparingly - prefer wait_for_element when possible.',
        input_schema: {
          type: 'object',
          properties: {
            duration: {
              type: 'number',
              description: 'Time to wait in milliseconds'
            }
          },
          required: ['duration']
        }
      },
      
      // Page inspection
      {
        name: 'get_browser_context',
        description: 'Get the current state of the browser including visible elements, console logs, and page metadata. Use this to understand what\'s on the page before taking actions.',
        input_schema: {
          type: 'object',
          properties: {
            detail_level: {
              type: 'string',
              enum: ['lightweight', 'standard', 'rich'],
              description: 'Level of detail to capture. lightweight=minimal tokens, standard=balanced, rich=maximum info'
            }
          },
          required: []
        }
      },
      
      {
        name: 'get_element_text',
        description: 'Get the text content of an element.',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element'
            }
          },
          required: ['selector']
        }
      },
      
      // Scrolling
      {
        name: 'scroll',
        description: 'Scroll the page or scroll to a specific element.',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of element to scroll to (optional)'
            },
            x: {
              type: 'number',
              description: 'Horizontal scroll position in pixels (optional)'
            },
            y: {
              type: 'number',
              description: 'Vertical scroll position in pixels (optional)'
            }
          },
          required: []
        }
      },
      
      // Task completion
      {
        name: 'task_complete',
        description: 'Mark the automation task as successfully completed. Use this when you have accomplished the user\'s goal.',
        input_schema: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'A brief summary of what was accomplished'
            }
          },
          required: ['summary']
        }
      },
      
      {
        name: 'task_failed',
        description: 'Mark the task as failed when you encounter an unrecoverable error or cannot proceed.',
        input_schema: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Explanation of why the task failed'
            },
            error_details: {
              type: 'string',
              description: 'Technical details about the error (optional)'
            }
          },
          required: ['reason']
        }
      }
    ];
  }
  
  /**
   * Get tool by name
   */
  public static getTool(name: string): Anthropic.Tool | undefined {
    return this.getTools().find(tool => tool.name === name);
  }
  
  /**
   * Validate tool input against schema
   */
  public static validateToolInput(toolName: string, input: any): { valid: boolean; error?: string } {
    const tool = this.getTool(toolName);
    if (!tool) {
      return { valid: false, error: `Tool '${toolName}' not found` };
    }
    
    const schema = tool.input_schema as any;
    const required = schema.required || [];
    
    // Check required fields
    for (const field of required) {
      if (!(field in input)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Get tool names as array
   */
  public static getToolNames(): string[] {
    return this.getTools().map(tool => tool.name);
  }
  
  /**
   * Get tools summary for logging
   */
  public static getSummary(): string {
    const tools = this.getTools();
    return `${tools.length} tools available: ${tools.map(t => t.name).join(', ')}`;
  }
}
