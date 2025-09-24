import { ActionValidator } from '../components/execution/validators/ActionValidator';
import { ActionType, ExecuteStep } from '../types';
import { IStepParserService } from './interfaces';

export class StepParserService implements IStepParserService {
  private readonly MAX_RETRIES_PER_STEP = 2;

  public parseAndValidateSteps(llmResponse: string): ExecuteStep[] {
    try {
      console.log('[StepParserService] Parsing LLM response:', llmResponse);

      const cleanedResponse = this.extractJSONFromResponse(llmResponse);
      let parsedSteps: any[];

      try {
        parsedSteps = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('[StepParserService] JSON parsing failed, trying alternative methods');
        throw new Error('Failed to parse execution steps from AI response');
      }

      if (!Array.isArray(parsedSteps)) {
        throw new Error('AI response is not a valid array of steps');
      }

      const validatedSteps: ExecuteStep[] = [];
      
      for (let i = 0; i < parsedSteps.length; i++) {
        const rawStep = parsedSteps[i];
        
        const step: ExecuteStep = {
          id: `step-${i + 1}`,
          action: this.normalizeActionType(rawStep.action),
          description: rawStep.description || `Step ${i + 1}`,
          target: rawStep.target || '',
          value: rawStep.value,
          reasoning: rawStep.reasoning || '',
          status: 'pending',
          maxRetries: this.MAX_RETRIES_PER_STEP,
          retryCount: 0
        };

        const validation = ActionValidator.validateStep(step);
        if (!validation.valid) {
          console.warn(`[StepParserService] Step ${i + 1} validation failed:`, validation.errors);
          const fixedStep = this.attemptStepFix(step, validation.errors);
          if (ActionValidator.validateStep(fixedStep).valid) {
            validatedSteps.push(fixedStep);
          } else {
            console.error(`[StepParserService] Could not fix step ${i + 1}, skipping`);
          }
        } else {
          validatedSteps.push(step);
        }
      }

      if (validatedSteps.length === 0) {
        throw new Error('No valid execution steps could be generated');
      }

      console.log(`[StepParserService] Successfully parsed and validated ${validatedSteps.length} steps`);
      return validatedSteps;
    } catch (error) {
      console.error('[StepParserService] Step parsing failed:', error);
      throw new Error(`Failed to parse execution steps: ${(error as Error).message}`);
    }
  }

  public extractJSONFromResponse(response: string): string {
    console.log('[StepParserService] Extracting JSON from response...');
    
    let cleaned = response.trim();
    
    cleaned = cleaned.replace(/^Here's the JSON array[^[]*/, '');
    cleaned = cleaned.replace(/^Based on the recorded workflow[^[]*/, '');
    cleaned = cleaned.replace(/^Following the recorded pattern[^[]*/, '');
    
    const patterns = [
      /^\s*(\[[\s\S]*\])\s*$/,
      /```(?:json)?\s*(\[[\s\S]*?\])\s*```/,
      /(?:array|steps|json)[:\s]*(\[[\s\S]*?\])/i,
      /(\[[\s\S]*?\])/,
      /(\[[\s\S]*?\])[^}]*/
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const jsonStr = match[1];
        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`[StepParserService] Successfully extracted JSON with ${parsed.length} steps`);
            return jsonStr;
          }
        } catch (e) {
          console.warn('[StepParserService] JSON validation failed for pattern:', pattern);
          continue;
        }
      }
    }

    const lines = cleaned.split('\n');
    let jsonStart = -1;
    let jsonEnd = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('[') && jsonStart === -1) {
        jsonStart = i;
      }
      if (lines[i].trim().endsWith(']') && jsonStart !== -1) {
        jsonEnd = i;
        break;
      }
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const extractedJson = lines.slice(jsonStart, jsonEnd + 1).join('\n');
      try {
        JSON.parse(extractedJson);
        console.log('[StepParserService] Extracted JSON using line-by-line method');
        return extractedJson;
      } catch (e) {
        console.warn('[StepParserService] Line-by-line extraction failed');
      }
    }

    console.error('[StepParserService] Failed to extract valid JSON from response');
    return cleaned;
  }

  public normalizeActionType(action: string): ActionType {
    if (!action) return ActionType.CLICK;
    
    const normalized = action.toLowerCase().trim();
    const actionMap: Record<string, ActionType> = {
      'navigate': ActionType.NAVIGATE,
      'go_to': ActionType.NAVIGATE,
      'visit': ActionType.NAVIGATE,
      'type': ActionType.TYPE,
      'input': ActionType.TYPE,
      'enter': ActionType.TYPE,
      'fill': ActionType.TYPE,
      'clear': ActionType.CLEAR,
      'click': ActionType.CLICK,
      'press': ActionType.CLICK,
      'tap': ActionType.CLICK,
      'select': ActionType.SELECT,
      'choose': ActionType.SELECT,
      'toggle': ActionType.TOGGLE,
      'check': ActionType.TOGGLE,
      'uncheck': ActionType.TOGGLE,
      'submit': ActionType.SUBMIT,
      
      'select_option': ActionType.SELECT_OPTION,
      'select_dropdown': ActionType.SELECT_OPTION,
      'dropdown': ActionType.SELECT_OPTION,
      'toggle_checkbox': ActionType.TOGGLE_CHECKBOX,
      'checkbox': ActionType.TOGGLE_CHECKBOX,
      'select_radio': ActionType.SELECT_RADIO,
      'radio': ActionType.SELECT_RADIO,
      'select_file': ActionType.SELECT_FILE,
      'upload': ActionType.SELECT_FILE,
      'file': ActionType.SELECT_FILE,
      'adjust_slider': ActionType.ADJUST_SLIDER,
      'slider': ActionType.ADJUST_SLIDER,
      'range': ActionType.ADJUST_SLIDER,
      
      'copy': ActionType.COPY,
      'cut': ActionType.CUT,
      'paste': ActionType.PASTE,
      
      'context_menu': ActionType.CONTEXT_MENU,
      'right_click': ActionType.CONTEXT_MENU,
      'contextmenu': ActionType.CONTEXT_MENU,
      
      'wait': ActionType.WAIT,
      'wait_for_element': ActionType.WAIT_FOR_ELEMENT,
      'wait_element': ActionType.WAIT_FOR_ELEMENT,
      'wait_for_dynamic_content': ActionType.WAIT_FOR_DYNAMIC_CONTENT,
      'wait_dynamic': ActionType.WAIT_FOR_DYNAMIC_CONTENT,
      'focus': ActionType.FOCUS,
      'blur': ActionType.BLUR,
      'hover': ActionType.HOVER,
      'keypress': ActionType.KEYPRESS,
      'key': ActionType.KEYPRESS,
      'scroll': ActionType.SCROLL,
      'extract': ActionType.EXTRACT,
      'get_data': ActionType.EXTRACT,
      'verify_element': ActionType.VERIFY_ELEMENT,
      'verify_text': ActionType.VERIFY_TEXT,
      'verify_url': ActionType.VERIFY_URL
    };

    return actionMap[normalized] || ActionType.CLICK;
  }

  public attemptStepFix(step: ExecuteStep, errors: string[]): ExecuteStep {
    const fixedStep = { ...step };

    for (const error of errors) {
      if (error.includes('URL is required') && step.action === ActionType.NAVIGATE) {
        if (!fixedStep.target && !fixedStep.value) {
          const urlMatch = step.description.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (urlMatch) {
            fixedStep.target = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
          }
        }
      }

      if (error.includes('Target selector required') && !fixedStep.target) {
        const selectorMatch = step.description.match(/['"`]([^'"`]+)['"`]/);
        if (selectorMatch) {
          fixedStep.target = selectorMatch[1];
        }
      }

      if (error.includes('value required') && !fixedStep.value) {
        const valueMatch = step.description.match(/(?:type|enter|select)\s+['"`]([^'"`]+)['"`]/i);
        if (valueMatch) {
          fixedStep.value = valueMatch[1];
        }
      }
    }

    return fixedStep;
  }
}
