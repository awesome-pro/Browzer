import { ActionType } from '../../types';
import { ActionStrategy } from './strategies/ActionStrategies';
import { ClearStrategy, SubmitStrategy } from './strategies/ClearAndSubmitStrategies';
import { ClickStrategy } from './strategies/ClickStrategy';
import { CopyStrategy, CutStrategy, PasteStrategy } from './strategies/ClipboardStrategies';
import { BlurStrategy, FocusStrategy, HoverStrategy, KeypressStrategy } from './strategies/ElementInteractionStrategies';
import { AdjustSliderStrategy, SelectFileStrategy, SelectOptionStrategy, SelectRadioStrategy, ToggleCheckboxStrategy } from './strategies/FormElementStrategies';
import { ContextMenuStrategy, ExtractStrategy, ScrollStrategy } from './strategies/MiscStrategies';
import { NavigationStrategy } from './strategies/NavigationStrategy';
import { TextInputStrategy } from './strategies/TextInputStrategy';
import { VerifyElementStrategy, VerifyTextStrategy, VerifyUrlStrategy } from './strategies/VerificationStrategies';
import { WaitForDynamicContentStrategy, WaitForElementStrategy, WaitTimeStrategy } from './strategies/WaitStrategies';

export class StrategyFactory {
  private static strategies: Map<ActionType, new () => ActionStrategy> = new Map([
    // Navigation and Basic Input
    [ActionType.NAVIGATION, NavigationStrategy],
    [ActionType.TYPE, TextInputStrategy],
    [ActionType.CLICK, ClickStrategy],
    [ActionType.CLEAR, ClearStrategy],
    [ActionType.SUBMIT, SubmitStrategy],
    
    // Element Interaction
    [ActionType.FOCUS, FocusStrategy],
    [ActionType.BLUR, BlurStrategy],
    [ActionType.HOVER, HoverStrategy],
    [ActionType.KEYPRESS, KeypressStrategy],
    
    // Wait Actions
    [ActionType.WAIT, WaitTimeStrategy],
    [ActionType.DYNAMIC_CONTENT, WaitForDynamicContentStrategy],
    
    // Form Element Actions
    [ActionType.SELECT, SelectOptionStrategy],
    [ActionType.TOGGLE, ToggleCheckboxStrategy],
    [ActionType.SELECT_OPTION, SelectOptionStrategy],
    [ActionType.TOGGLE_CHECKBOX, ToggleCheckboxStrategy],
    [ActionType.SELECT_RADIO, SelectRadioStrategy],
    [ActionType.SELECT_FILE, SelectFileStrategy],
    [ActionType.ADJUST_SLIDER, AdjustSliderStrategy],
    
    // Clipboard Actions
    [ActionType.COPY, CopyStrategy],
    [ActionType.CUT, CutStrategy],
    [ActionType.PASTE, PasteStrategy],
    
    // Miscellaneous Actions
    [ActionType.SCROLL, ScrollStrategy],
    [ActionType.CONTEXT_MENU, ContextMenuStrategy]
  ]);

  static createStrategy(actionType: ActionType): ActionStrategy {
    const StrategyClass = this.strategies.get(actionType);
    if (!StrategyClass) {
      throw new Error(`No strategy found for action type: ${actionType}`);
    }
    
    return new StrategyClass();
  }

  static getAllSupportedActions(): ActionType[] {
    return Array.from(this.strategies.keys());
  }

  static registerStrategy(actionType: ActionType, strategyClass: new () => ActionStrategy): void {
    this.strategies.set(actionType, strategyClass);
  }
}