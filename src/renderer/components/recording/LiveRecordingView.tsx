import { Play } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { ItemGroup } from '../../ui/item';
import { RecordedAction } from '../../../shared/types';
import { SaveRecordingForm } from './SaveRecordingForm';
import { ActionItem } from './ActionItem';

interface LiveRecordingViewProps {
  actions: RecordedAction[];
  isRecording: boolean;
  showSaveForm: boolean;
  recordingData: { actions: RecordedAction[]; duration: number; startUrl: string } | null;
  onSave: (name: string, description: string) => void;
  onDiscard: () => void;
}

export function LiveRecordingView({
  actions,
  isRecording,
  showSaveForm,
  recordingData,
  onSave,
  onDiscard,
}: LiveRecordingViewProps) {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Recording Status */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium">Recording</span>
            </>
          ) : showSaveForm ? (
            <>
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-xs font-medium">Save Recording</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 bg-gray-600 rounded-full" />
              <span className="text-xs font-medium text-gray-400">Not Recording</span>
            </>
          )}
        </div>
        <Badge className="text-xs">
          {actions.length} {actions.length === 1 ? 'action' : 'actions'}
        </Badge>
      </div>

      {/* Content Area - Either Save Form or Actions List */}
      <div className="flex-1 overflow-y-auto">
        {showSaveForm && recordingData ? (
          <SaveRecordingForm
            actionCount={recordingData.actions.length}
            duration={recordingData.duration}
            onSave={onSave}
            onDiscard={onDiscard}
          />
        ) : actions.length === 0 ? (
          /* Empty State */
          <section className='text-center py-12'>
             <Play className="w-12 h-12 mx-auto text-gray-600 mb-3" />
              <h3 className="text-sm font-semibold text-gray-300 mb-2">No Actions Recorded</h3>
              <p className="text-xs text-gray-500">
                {isRecording ? 'Perform actions to see them here' : 'Start recording to capture actions'}
              </p>
          </section>
        ) : (
          /* Actions List */
          <ItemGroup>
            {actions.map((action, index) => (
              <ActionItem key={`${action.timestamp}-${index}`} action={action} index={index} />
            ))}
          </ItemGroup>
        )}
      </div>
    </div>
  );
}
