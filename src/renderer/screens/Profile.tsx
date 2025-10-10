import { useEffect, useState } from 'react';
import { Calendar, CreditCard, Loader2Icon, LogOut, Pencil, Trash2 } from 'lucide-react';
import type { User as UserType } from '../../shared/types';
import { SubscriptionStatus } from '../../shared/types';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { Input } from '../ui/input';
import { formatDate } from '../lib/utils';
import { Badge } from '../ui/badge';

/**
 * Profile Screen
 * 
 * Allows users to view and manage their profile, preferences, and subscription.
 * This is a placeholder implementation ready for full feature expansion.
 */
export function Profile() {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userData = await window.browserAPI.getCurrentUser();
      
      if (userData) {
        setUser(userData);
        setFormData({ name: userData.name, email: userData.email });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      // TODO: Update user profile
      await window.browserAPI.updateProfile(formData);
      
      if (user) {
        setUser({ ...user, ...formData });
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await window.browserAPI.signOut();
      toast.success('Signed out successfully');
      // Redirect to sign in page
      window.location.hash = '#/signin';
    } catch (error) {
      console.error('Failed to sign out:', error);
      toast.error('Failed to sign out');
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    try {
      await window.browserAPI.deleteAccount();
      toast.success('Account deleted successfully');
      window.location.hash = '#/signin';
    } catch (error) {
      console.error('Failed to delete account:', error);
      toast.error('Failed to delete account');
    }
  };

  if (loading) {
    return (
      <main className='h-screen flex items-center justify-center'>
        <Loader2Icon className='w-4 h-4 animate-spin' />
      </main>
    );
  }

  if (!user) {
    return (
      <section className="min-h-screen bg-slate-200 dark:bg-slate-800 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-6">
            <span className="text-3xl font-bold text-white">B</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to Browzer
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please sign in to view your profile
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => window.location.hash = '#/signin'}>
              Sign In
            </Button>
            <Button variant="outline" onClick={() => window.location.hash = '#/signup'}>
              Sign Up
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 overflow-auto">

      {/* Content */}
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
        {/* Profile Information */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                variant='outline'
              >
                <Pencil className='w-4 h-4 mr-2' />
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setIsEditing(false);
                    setFormData({ name: user.name, email: user.email });
                  }}
                  variant='ghost'
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                >
                  Save Changes
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              ) : (
                <p className="text-gray-900">{user.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              {isEditing ? (
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              ) : (
                <p className="text-gray-900">{user.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Member Since</label>
              <p className="text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                {formatDate(user.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Subscription
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Current Plan</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {user.subscription.plan || 'Free'}
                </p>
              </div>
              <Badge
                variant={user.subscription.status === SubscriptionStatus.ACTIVE ? 'success' : 'destructive'}
              >
                {user.subscription.status}
              </Badge>
            </div>

            {user.subscription.status === SubscriptionStatus.ACTIVE && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-3">
                  Upgrade to Pro to unlock advanced features, unlimited recordings, and priority support.
                </p>
                <Button onClick={() => toast.success('Upgrade to Pro')}>
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Actions</h2>
          
          <div className="flex gap-2 w-fu">
            <Button
              onClick={handleSignOut}
              variant="outline"
            >
              <LogOut className="w-5 h-5" /> Sign Out
            </Button>

            <Button
              onClick={handleDeleteAccount}
              variant="destructive"
            >
              <Trash2 className="w-5 h-5" />
              Delete Account
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
