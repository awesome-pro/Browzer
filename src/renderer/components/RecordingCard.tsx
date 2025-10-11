import { Play, Trash2, Clock, Video, MousePointerClick, Calendar, ExternalLink } from 'lucide-react';
import type { RecordingSession } from '../../shared/types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatDate, formatDuration, formatFileSize } from '../lib/utils';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';

interface RecordingCardProps {
  recording: RecordingSession;
  onPlay: (recording: RecordingSession) => void;
  onDelete: (id: string) => void;
}

export function RecordingCard({ recording, onPlay, onDelete }: RecordingCardProps) {
  const hasVideo = !!recording.video;

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{recording.name}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {recording.description || 'No description'}
            </CardDescription>
          </div>
          {hasVideo && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
              <Video className="w-3 h-3 mr-1" />
              Video
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* URL */}
        {recording.url && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span className="truncate">{recording.url}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded">
              <MousePointerClick className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Actions</p>
              <p className="font-semibold text-gray-900 dark:text-white">{recording.actionCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded">
              <Clock className="w-3.5 h-3.5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatDuration(recording.duration)}
              </p>
            </div>
          </div>
        </div>

        {/* Video Info */}
        {hasVideo && recording.video && (
          <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Video className="w-3 h-3" />
                {recording.video.displayInfo.width}x{recording.video.displayInfo.height}
              </span>
              <span>{formatFileSize(recording.video.fileSize)}</span>
            </div>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(recording.createdAt)}
        </div>
      </CardContent>

      <CardFooter className="pt-3 gap-2">
        <Button
          onClick={() => onPlay(recording)}
          className="flex-1"
          size="sm"
        >
          <Play className="w-4 h-4 mr-2" />
          {hasVideo ? 'Play Video' : 'View Actions'}
        </Button>
        <Button
          onClick={() => onDelete(recording.id)}
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
