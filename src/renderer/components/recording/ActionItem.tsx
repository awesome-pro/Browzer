import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from '../../ui/item';
import { RecordedAction } from '../../../shared/types';
import { RecordingUtils } from '../../utils';
import { Badge } from '../../ui/badge';

interface ActionItemProps {
  action: RecordedAction;
  index: number;
}

export function ActionItem({ action }: ActionItemProps) {
  const { icon: Icon, title, description, color } = RecordingUtils.getActionDisplay(action);

  return (
    <Item size="sm" className="animate-in slide-in-from-top duration-200 m-1 bg-blue-50">
      <ItemMedia variant="icon" className={color}>
        <Icon />
      </ItemMedia>
      
      <ItemContent>
        <div className="flex items-center gap-2">
          <ItemTitle className="text-xs font-semibold text-black">{title}</ItemTitle>
          {action.tabId && action.type !== 'tab-switch' && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {action.tabTitle || action.tabId}
            </Badge>
          )}
        </div>
        <ItemDescription className="text-xs">{description}</ItemDescription>
      </ItemContent>
      
      <div className="text-xs text-gray-600">
        {new Date(action.timestamp).toLocaleTimeString()}
      </div>
    </Item>
  );
}
