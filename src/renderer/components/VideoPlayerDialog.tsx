import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Download, X, SkipBack, SkipForward, MousePointerClick, Clock, Calendar } from 'lucide-react';
import type { RecordingSession, RecordedAction } from '../../shared/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { formatDate, formatDuration } from '../lib/utils';
import { ScrollArea } from '../ui/scroll-area';

interface VideoPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recording: RecordingSession;
}

export function VideoPlayerDialog({ open, onOpenChange, recording }: VideoPlayerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedAction, setSelectedAction] = useState<RecordedAction | null>(null);

  const hasVideo = !!recording.video;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, duration);
    }
  };

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
    }
  };

  const jumpToAction = (action: RecordedAction) => {
    if (videoRef.current && recording.video) {
      // Calculate relative time in video
      const actionTime = action.timestamp - recording.video.startTimestamp;
      const videoTime = actionTime / 1000; // Convert to seconds
      
      if (videoTime >= 0 && videoTime <= duration) {
        videoRef.current.currentTime = videoTime;
        setSelectedAction(action);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getActionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      click: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      input: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      navigate: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      submit: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      select: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    };
    return colors[type] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className=" w-[800px] h-[85vh] p-0 flex flex-col">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl">{recording.name}</DialogTitle>
                <DialogDescription className="mt-2">
                  {recording.description || 'No description'}
                </DialogDescription>
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(recording.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatDuration(recording.duration)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MousePointerClick className="w-4 h-4" />
                    {recording.actionCount} actions
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs defaultValue={hasVideo ? "video" : "actions"} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-6 mt-4">
                {hasVideo && (
                  <TabsTrigger value="video" className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Video
                  </TabsTrigger>
                )}
                <TabsTrigger value="actions" className="flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4" />
                  Actions ({recording.actionCount})
                </TabsTrigger>
              </TabsList>

              {/* Video Tab */}
              {hasVideo && (
                <TabsContent value="video" className="flex-1 px-6 pb-6 mt-4 overflow-auto">
                  <div className="space-y-4">
                    {/* Video Player */}
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                      <video
                        ref={videoRef}
                        src={`file://${recording.video?.filePath}`}
                        className="w-full h-full"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={() => setIsPlaying(false)}
                      />
                      
                      {/* Play Overlay */}
                      {!isPlaying && (
                        <div 
                          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                          onClick={togglePlayPause}
                        >
                          <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center">
                            <Play className="w-10 h-10 text-gray-900 ml-1" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Video Controls */}
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <Slider
                          value={[currentTime]}
                          max={duration || 100}
                          step={0.1}
                          onValueChange={handleSeek}
                          className="cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      {/* Control Buttons */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={skipBackward}
                          >
                            <SkipBack className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={togglePlayPause}
                          >
                            {isPlaying ? (
                              <Pause className="w-5 h-5" />
                            ) : (
                              <Play className="w-5 h-5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={skipForward}
                          >
                            <SkipForward className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleMute}
                          >
                            {isMuted ? (
                              <VolumeX className="w-4 h-4" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </Button>
                          <div className="w-24">
                            <Slider
                              value={[isMuted ? 0 : volume * 100]}
                              max={100}
                              step={1}
                              onValueChange={(value) => {
                                setVolume(value[0] / 100);
                                setIsMuted(false);
                              }}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleFullscreen}
                          >
                            <Maximize className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* Actions Tab */}
              <TabsContent value="actions" className="flex-1 px-6 pb-6 mt-4 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-2">
                    {recording.actions.map((action, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border transition-all cursor-pointer ${
                          selectedAction === action
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                        onClick={() => hasVideo && jumpToAction(action)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={getActionTypeColor(action.type)}>
                                {action.type}
                              </Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(action.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            
                            {action.target && (
                              <div className="space-y-1 text-sm">
                                {action.target.text && (
                                  <p className="text-gray-900 dark:text-white font-medium">
                                    {action.target.text}
                                  </p>
                                )}
                                {action.target.selector && (
                                  <p className="text-gray-600 dark:text-gray-400 font-mono text-xs truncate">
                                    {action.target.selector}
                                  </p>
                                )}
                                {action.value && (
                                  <p className="text-gray-700 dark:text-gray-300">
                                    Value: <span className="font-medium">{String(action.value)}</span>
                                  </p>
                                )}
                              </div>
                            )}
                            
                            {action.url && (
                              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 break-all line-clamp-2">
                                → {action.url}
                              </p>
                            )}

                            {action.effects?.summary && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                Effects: {action.effects.summary}
                              </p>
                            )}
                          </div>

                          {hasVideo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                jumpToAction(action);
                              }}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
