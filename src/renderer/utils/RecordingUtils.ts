/* eslint-disable no-case-declarations */
import { MousePointer2, Keyboard, List, CheckCircle, RadioTower, Upload, Command, Navigation, CheckSquare, Circle, ArrowRightLeft } from "lucide-react";
import { RecordedAction } from "../../shared/types";

export class RecordingUtils {
    
    public static getActionDisplay(action: RecordedAction): {
        icon: any;
        title: string;
        description: string;
        color: string;
      } {
        switch (action.type) {
          case 'click':
            return {
              icon: MousePointer2,
              title: 'Click',
              description: action.target?.text || action.target?.tagName || 'Element clicked',
              color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            };
      
          case 'input':
            const inputType = action.target?.type || 'text';
            return {
              icon: Keyboard,
              title: `Input (${inputType})`,
              description: `Entered text in ${action.target?.tagName || 'field'}`,
              color: 'bg-green-500/10 text-green-400 border-green-500/20',
            };
      
          case 'select':
            const isMultiple = action.metadata?.isMultiple;
            const selectedCount = Array.isArray(action.value) ? action.value.length : 1;
            return {
              icon: List,
              title: isMultiple ? 'Multi-Select' : 'Select',
              description: isMultiple 
                ? `Selected ${selectedCount} option(s)` 
                : `Selected: ${action.metadata?.selectedTexts?.[0] || action.value}`,
              color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
            };
      
          case 'checkbox':
            const checked = action.value === true;
            return {
              icon: CheckCircle,
              title: 'Checkbox',
              description: `${checked ? 'Checked' : 'Unchecked'} ${action.metadata?.label || 'checkbox'}`,
              color: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
            };
      
          case 'radio':
            return {
              icon: RadioTower,
              title: 'Radio Button',
              description: `Selected: ${action.metadata?.label || action.value}`,
              color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
            };
      
          case 'file-upload':
            const fileCount = action.metadata?.fileCount || 0;
            return {
              icon: Upload,
              title: 'File Upload',
              description: `Uploaded ${fileCount} file(s): ${action.value}`,
              color: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
            };
      
          case 'navigate':
            const url = action.url || '';
            const domain = url.replace(/^https?:\/\//, '').split('/')[0];
            const isSPA = action.metadata?.spa;
            return {
              icon: Navigation,
              title: isSPA ? 'Navigate (SPA)' : 'Navigate',
              description: domain || url,
              color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
            };
      
          case 'keypress':
            const shortcut = action.metadata?.shortcut || action.value;
            const isShortcut = action.metadata?.isShortcut;
            return {
              icon: isShortcut ? Command : Keyboard,
              title: isShortcut ? 'Shortcut' : 'Keypress',
              description: `Pressed ${shortcut}`,
              color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            };
      
          case 'submit':
            const triggerText = action.metadata?.triggeredBy?.text;
            return {
              icon: CheckSquare,
              title: 'Form Submit',
              description: triggerText ? `Via: ${triggerText}` : 'Form submitted',
              color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
            };
      
          case 'tab-switch':
            const toTabTitle = action.metadata?.toTabTitle || 'Unknown Tab';
            return {
              icon: ArrowRightLeft,
              title: 'Tab Switch',
              description: `Switched to: ${toTabTitle}`,
              color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
            };
      
          default:
            return {
              icon: Circle,
              title: action.type,
              description: 'Action recorded',
              color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
            };
        }
      }
      
}
