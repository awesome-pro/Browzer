import { useEffect, useState } from 'react';
import { Video, Search, X, RefreshCcw, Loader2Icon, Play, HardDrive, Film } from 'lucide-react';
import type { RecordingSession } from '../../shared/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { formatFileSize } from '../lib/utils';
import { RecordingCard } from '../components/RecordingCard';
import { VideoPlayerDialog } from '../components/VideoPlayerDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

export function Recordings() {
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [filteredRecordings, setFilteredRecordings] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
  const [videoPlayerOpen, setVideoPlayerOpen] = useState(false);

  useEffect(() => {
    loadRecordings();
  }, []);

  useEffect(() => {
    filterRecordings();
  }, [searchQuery, recordings]);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const allRecordings = await window.browserAPI.getAllRecordings();
      // Sort by creation date (newest first)
      const sorted = allRecordings.sort((a, b) => b.createdAt - a.createdAt);
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
    if (!searchQuery.trim()) {
      setFilteredRecordings(recordings);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = recordings.filter(
      (recording) =>
        recording.name.toLowerCase().includes(query) ||
        recording.description?.toLowerCase().includes(query) ||
        recording.url?.toLowerCase().includes(query)
    );
    setFilteredRecordings(filtered);
  };

  const handleDeleteRecording = async (id: string) => {
    try {
      await window.browserAPI.deleteRecording(id);
      toast.success('Recording deleted');
      loadRecordings();
      setDeleteDialogOpen(false);
      setRecordingToDelete(null);
    } catch (error) {
      console.error('Failed to delete recording:', error);
      toast.error('Failed to delete recording');
    }
  };

  const openDeleteDialog = (id: string) => {
    setRecordingToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handlePlayRecording = (recording: RecordingSession) => {
    setSelectedRecording(recording);
    setVideoPlayerOpen(true);
  };

  const calculateStats = () => {
    const totalRecordings = recordings.length;
    const totalActions = recordings.reduce((sum, r) => sum + r.actionCount, 0);
    const withVideo = recordings.filter(r => r.video).length;
    const totalVideoSize = recordings.reduce((sum, r) => sum + (r.video?.fileSize || 0), 0);

    return {
      totalRecordings,
      totalActions,
      withVideo,
      totalVideoSize,
    };
  };

  const groupByDate = (recordings: RecordingSession[]) => {
    const groups: Record<string, RecordingSession[]> = {};

    recordings.forEach((recording) => {
      const date = new Date(recording.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateKey: string;

      if (date.toDateString() === today.toDateString()) {
        dateKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(recording);
    });

    return groups;
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2Icon className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const stats = calculateStats();
  const groupedRecordings = groupByDate(filteredRecordings);

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
              {stats.totalRecordings} recordings • {stats.totalActions} total actions
              {stats.withVideo > 0 && ` • ${stats.withVideo} with video`}
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => { 
                loadRecordings(); 
                toast.success('Recordings Refreshed'); 
              }} 
              disabled={loading}
            >
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative bg-white">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search recordings by name, description, or URL..."
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
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Film className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Recordings</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalRecordings}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Play className="w-5 h-5 text-green-600" />
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
                <Video className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">With Video</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.withVideo}</p>
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
      </div>

      {/* Recordings List */}
      <div className="max-w-7xl mx-auto px-8 pb-8">
        {filteredRecordings.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
            <Video className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No recordings found' : 'No recordings yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {searchQuery
                ? 'Try a different search term'
                : 'Start recording your workflows to see them here'}
            </p>
            {!searchQuery && (
              <Button onClick={() => window.location.href = 'https://www.google.com'}>
                <Play className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedRecordings).map(([date, dateRecordings]) => (
              <div key={date} className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white px-2">
                  {date}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dateRecordings.map((recording) => (
                    <RecordingCard
                      key={recording.id}
                      recording={recording}
                      onPlay={handlePlayRecording}
                      onDelete={openDeleteDialog}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Player Dialog */}
      {selectedRecording && (
        <VideoPlayerDialog
          open={videoPlayerOpen}
          onOpenChange={setVideoPlayerOpen}
          recording={selectedRecording}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the recording
              {recordingToDelete && recordings.find(r => r.id === recordingToDelete)?.video 
                ? ' and its video file' 
                : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => recordingToDelete && handleDeleteRecording(recordingToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
