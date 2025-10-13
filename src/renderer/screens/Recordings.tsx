import { useEffect, useState } from 'react';
import { 
  Play, 
  Trash2, 
  Clock, 
  Video, 
  MousePointerClick, 
  Calendar, 
  Loader2Icon, 
  ExternalLink, 
  X, 
  RefreshCcw,
  Download,
  Search,
  Filter,
  FileVideo,
  HardDrive
} from 'lucide-react';
import type { RecordingSession } from '../../shared/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { formatDate, formatDuration, formatFileSize } from '../lib/utils';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export function Recordings() {
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [filteredRecordings, setFilteredRecordings] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with-video' | 'actions-only'>('all');
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession | null>(null);
  const [isPlayDialogOpen, setIsPlayDialogOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadRecordings();
  }, []);

  useEffect(() => {
    filterRecordings();
  }, [searchQuery, filterType, recordings]);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const data = await window.browserAPI.getAllRecordings();
      // Sort by creation date (newest first)
      const sorted = data.sort((a, b) => b.createdAt - a.createdAt);
      setRecordings(sorted);
      setFilteredRecordings(sorted);
    } catch (error) {
      console.error('Failed to load recordings:', error);
      toast.error('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const filterRecordings = () => {
    let filtered = [...recordings];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (rec) =>
          rec.name.toLowerCase().includes(query) ||
          rec.description?.toLowerCase().includes(query) ||
          rec.url.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (filterType === 'with-video') {
      filtered = filtered.filter((rec) => rec.videoPath);
    } else if (filterType === 'actions-only') {
      filtered = filtered.filter((rec) => !rec.videoPath);
    }

    setFilteredRecordings(filtered);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recording? This action cannot be undone.')) {
      return;
    }

    try {
      await window.browserAPI.deleteRecording(id);
      toast.success('Recording deleted');
      loadRecordings();
    } catch (error) {
      console.error('Failed to delete recording:', error);
      toast.error('Failed to delete recording');
    }
  };

  const handlePlay = async (recording: RecordingSession) => {
    setSelectedRecording(recording);
    setIsPlayDialogOpen(true);
    
    // Load video URL if video exists
    if (recording.videoPath) {
      try {
        const url = await window.browserAPI.getVideoFileUrl(recording.videoPath);
        setVideoUrl(url);
      } catch (error) {
        console.error('Failed to load video URL:', error);
        setVideoUrl(null);
      }
    } else {
      setVideoUrl(null);
    }
  };

  const handleOpenVideo = async (videoPath: string) => {
    try {
      await window.browserAPI.openVideoFile(videoPath);
      toast.success('Opening video file...');
    } catch (error) {
      console.error('Failed to open video:', error);
      toast.error('Failed to open video file');
    }
  };

  const getTotalStats = () => {
    const totalActions = recordings.reduce((sum, rec) => sum + rec.actionCount, 0);
    const totalDuration = recordings.reduce((sum, rec) => sum + rec.duration, 0);
    const totalVideoSize = recordings.reduce((sum, rec) => sum + (rec.videoSize || 0), 0);
    const withVideo = recordings.filter((rec) => rec.videoPath).length;

    return {
      total: recordings.length,
      totalActions,
      totalDuration,
      totalVideoSize,
      withVideo,
    };
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2Icon className="size-4 animate-spin text-blue-600" />
      </div>
    );
  }

  const stats = getTotalStats();

  return (
    <div className="bg-slate-100 dark:bg-slate-800 min-h-screen">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Video className="w-6 h-6 text-blue-600" />
              Recordings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {stats.total} recordings • {stats.withVideo} with video • {stats.totalActions} total actions
            </p>
          </div>

          <Button 
            onClick={() => { 
              loadRecordings(); 
              toast.success('Recordings refreshed'); 
            }} 
            disabled={loading}
          >
            <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative bg-white">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search recordings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-800 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterType('all')}
            >
              <Filter className="w-4 h-4 mr-2" />
              All
            </Button>
            <Button
              variant={filterType === 'with-video' ? 'default' : 'outline'}
              onClick={() => setFilterType('with-video')}
            >
              <FileVideo className="w-4 h-4 mr-2" />
              With Video
            </Button>
            <Button
              variant={filterType === 'actions-only' ? 'default' : 'outline'}
              onClick={() => setFilterType('actions-only')}
            >
              <MousePointerClick className="w-4 h-4 mr-2" />
              Actions Only
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Video className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Recordings</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <MousePointerClick className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Actions</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalActions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Duration</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatDuration(stats.totalDuration)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <HardDrive className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Storage Used</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatFileSize(stats.totalVideoSize)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recordings Grid */}
        {filteredRecordings.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
            <Video className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No recordings found' : 'No recordings yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery
                ? 'Try a different search term or filter'
                : 'Start recording your browser actions to see them here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecordings.map((recording) => (
              <Card 
                key={recording.id} 
                className="group hover:shadow-lg transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{recording.name}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-1">
                        {recording.description || 'No description'}
                      </CardDescription>
                    </div>
                    {recording.videoPath && (
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
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <MousePointerClick className="w-4 h-4" />
                      <span>{recording.actionCount} actions</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>{formatDuration(recording.duration)}</span>
                    </div>
                  </div>

                  {/* Video Info */}
                  {recording.videoPath && recording.videoSize && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <HardDrive className="w-4 h-4" />
                      <span>{formatFileSize(recording.videoSize)}</span>
                      {recording.videoFormat && (
                        <Badge variant="outline" className="text-xs">
                          {recording.videoFormat.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Date */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(recording.createdAt)}</span>
                  </div>
                </CardContent>

                <CardFooter className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handlePlay(recording)}
                    className="flex-1"
                    size="sm"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    View
                  </Button>
                  {recording.videoPath && (
                    <Button
                      onClick={() => handleOpenVideo(recording.videoPath)}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    onClick={() => handleDelete(recording.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recording Details Dialog */}
      <Dialog open={isPlayDialogOpen} onOpenChange={setIsPlayDialogOpen}>
        <DialogContent className="max-w-[90vw] w-[1250px] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Video className="w-6 h-6 text-blue-600" />
              {selectedRecording?.name}
            </DialogTitle>
           
          </DialogHeader>

          {selectedRecording && (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                {/* Left Column - Video Player */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Video Player */}
                  {selectedRecording.videoPath && videoUrl && (
                    <div className="bg-black rounded-lg overflow-hidden shadow-lg">
                      <video
                        key={videoUrl}
                        src={videoUrl}
                        controls
                        className="w-full"
                        style={{ maxHeight: '600px' }}
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}
                  
                  {selectedRecording.videoPath && !videoUrl && (
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-12 text-center">
                      <Loader2Icon className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                      <p className="text-base text-gray-600 dark:text-gray-400">Loading video...</p>
                    </div>
                  )}

                  {/* Recording Info */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recording Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Description</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {selectedRecording.description || 'No description provided'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">URL</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {selectedRecording.url}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Created</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDate(selectedRecording.createdAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Duration</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDuration(selectedRecording.duration)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Actions</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {selectedRecording.actionCount} recorded
                        </p>
                      </div>
                      {selectedRecording.videoSize && (
                        <>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Video Size</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatFileSize(selectedRecording.videoSize)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Format</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {selectedRecording.videoFormat?.toUpperCase() || 'N/A'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column - Actions List */}
                <div className="lg:col-span-1">
                  <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 sticky top-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <MousePointerClick className="w-5 h-5 text-blue-600" />
                      Recorded Actions ({selectedRecording.actions.length})
                    </h3>
                    <div className="max-h-[600px] overflow-y-auto space-y-2 pr-2">
                      {selectedRecording.actions.map((action, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 text-sm p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 transition-colors"
                        >
                          <Badge variant="outline" className="shrink-0 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                            {index + 1}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white mb-1">
                              {action.type}
                            </p>
                            {action.value && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                Value: {action.value}
                              </p>
                            )}
                            <span className="text-xs text-gray-500 mt-1 block">
                              {new Date(action.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900">
            {selectedRecording?.videoPath && (
              <Button
                onClick={() => handleOpenVideo(selectedRecording.videoPath)}
                variant="outline"
              >
                <Download className="w-4 h-4 mr-2" />
                Open Video File
              </Button>
            )}
            <Button onClick={() => setIsPlayDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
