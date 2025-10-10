import { useState } from 'react';
import { Save, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '../ui/alert-dialog';

interface SaveRecordingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  actionCount: number;
  duration: number;
}

export function SaveRecordingDialog({ 
  open, 
  onClose, 
  onSave, 
  actionCount, 
  duration 
}: SaveRecordingDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      setError('Recording name is required');
      return;
    }

    onSave(name.trim(), description.trim());
    setName('');
    setDescription('');
    setError('');
  };

  const handleDiscard = () => {
    setName('');
    setDescription('');
    setError('');
    onClose();
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save Recording
          </AlertDialogTitle>
          <AlertDialogDescription>
            Recorded {actionCount} actions in {formatDuration(duration)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Name Input */}
          <div>
            <label htmlFor="recording-name" className="block text-sm font-medium text-gray-300 mb-1">
              Recording Name <span className="text-red-500">*</span>
            </label>
            <input
              id="recording-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g., Login Flow, Checkout Process"
              className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
          </div>

          {/* Description Input */}
          <div>
            <label htmlFor="recording-description" className="block text-sm font-medium text-gray-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="recording-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this recording..."
              rows={3}
              className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <AlertDialogFooter className="flex gap-2">
          <button
            onClick={handleDiscard}
            className="flex-1 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            Discard
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
