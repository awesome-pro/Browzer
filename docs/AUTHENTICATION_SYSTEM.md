# Authentication System

## Overview

Browzer now includes a complete authentication system with user management, session handling, and profile management. The system uses **in-memory storage** (electron-store) for now and is designed to be easily migrated to a backend service in the future.

## Features Implemented

### ✅ User Management
- User registration (sign up)
- User authentication (sign in)
- Guest mode (temporary users)
- Profile management
- Account deletion

### ✅ Session Management
- Persistent sessions across app restarts
- Automatic session refresh (30-day duration)
- Session expiration handling
- Secure session storage

### ✅ UI Screens
- **Sign In** (`browzer://signin`) - Professional login screen
- **Sign Up** (`browzer://signup`) - Registration with validation
- **Profile** (`browzer://profile`) - User profile management

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Renderer Process                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   SignIn    │  │   SignUp    │  │   Profile   │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                 │                 │             │
│         └─────────────────┴─────────────────┘             │
│                           │                               │
│                    window.browserAPI                      │
└───────────────────────────┼───────────────────────────────┘
                            │ IPC
┌───────────────────────────┼───────────────────────────────┐
│                    Main Process                           │
│                           │                               │
│                    ┌──────▼──────┐                        │
│                    │ IPCHandlers │                        │
│                    └──────┬──────┘                        │
│                           │                               │
│                    ┌──────▼──────┐                        │
│                    │ UserService │                        │
│                    └──────┬──────┘                        │
│                           │                               │
│                    ┌──────▼──────┐                        │
│                    │electron-store│                       │
│                    └─────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

## User Flow

### 1. First Time User
```
App Launch
  → No session found
  → Navigate to browzer://signin
  → User clicks "Sign up"
  → Navigate to browzer://signup
  → User fills form
  → Account created + Auto sign-in
  → Navigate to browzer://profile
```

### 2. Returning User
```
App Launch
  → Session found in storage
  → Session valid (not expired)
  → User auto-signed in
  → Navigate to browzer://profile
```

### 3. Guest Mode
```
Sign In Screen
  → User clicks "Continue as Guest"
  → Temporary account created
  → Navigate to browzer://profile
  → (Guest account deleted on sign out)
```

## API Reference

### Browser API (Renderer → Main)

```typescript
// Get current user
const user = await window.browserAPI.getCurrentUser();
// Returns: User | null

// Check authentication status
const isAuth = await window.browserAPI.isAuthenticated();
// Returns: boolean

// Sign in
const user = await window.browserAPI.signIn(email, password);
// Returns: User

// Sign up
const user = await window.browserAPI.createUser({
  name: 'John Doe',
  email: 'john@example.com',
  password: 'securepassword123'
});
// Returns: User

// Sign out
await window.browserAPI.signOut();
// Returns: void

// Update profile
const updatedUser = await window.browserAPI.updateProfile({
  name: 'New Name',
  avatar: 'https://...'
});
// Returns: User

// Update preferences
const updatedUser = await window.browserAPI.updateUserPreferences({
  theme: 'dark',
  language: 'en',
  notifications: true
});
// Returns: User

// Delete account
await window.browserAPI.deleteAccount();
// Returns: void

// Create guest user
const guestUser = await window.browserAPI.createGuestUser();
// Returns: User
```

## Data Models

### User
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: number;
  verifiedAt?: number;
  lastLoginAt?: number;
  subscription: Subscription;
  preferences: UserPreferences;
  metadata?: Record<string, unknown>;
}
```

### Session
```typescript
interface Session {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  deviceInfo?: {
    platform: string;
    version: string;
  };
}
```

### Subscription
```typescript
interface Subscription {
  status: 'active' | 'inactive' | 'expired' | 'cancelled';
  plan: 'free' | 'premium';
  startDate?: number;
  endDate?: number;
  trialEndsAt?: number;
}
```

## UI Components

All screens use **shadcn/ui** components for a modern, professional look:

### Sign In Screen
- Email/password form
- Guest mode button
- Link to sign up
- Professional gradient background
- Loading states
- Error handling with toast notifications

### Sign Up Screen
- Full name, email, password fields
- Password confirmation
- Client-side validation
- Auto sign-in after registration
- Link to sign in

### Profile Screen
- User avatar (generated from initials)
- Editable profile information
- Subscription status display
- Member since date
- Sign out button
- Delete account button
- Responsive design
- Dark mode support

## Storage

### Current Implementation
- **electron-store** for local persistence
- Separate stores for users and sessions
- Data stored in:
  - `~/Library/Application Support/browzer/users.json` (macOS)
  - `%APPDATA%/browzer/users.json` (Windows)
  - `~/.config/browzer/users.json` (Linux)

### Data Structure
```json
// users.json
{
  "users": {
    "user-id-1": {
      "id": "user-id-1",
      "email": "user@example.com",
      "name": "John Doe",
      "isVerified": false,
      "createdAt": 1234567890,
      "subscription": {
        "status": "active",
        "plan": "free"
      },
      "preferences": {
        "theme": "system",
        "language": "en",
        "notifications": true
      }
    }
  }
}

// session.json
{
  "currentSession": {
    "sessionId": "session-id-1",
    "userId": "user-id-1",
    "createdAt": 1234567890,
    "expiresAt": 1237159890,
    "lastActivityAt": 1234567890,
    "deviceInfo": {
      "platform": "darwin",
      "version": "1.0.0"
    }
  }
}
```

## Security Considerations

### Current (Development)
- ⚠️ Passwords not hashed (stored in plain text)
- ⚠️ No email verification
- ⚠️ Sessions stored unencrypted
- ⚠️ No rate limiting

### Future (Production)
- ✅ Use bcrypt for password hashing
- ✅ Implement email verification
- ✅ Use Electron's `safeStorage` API for tokens
- ✅ Add rate limiting on backend
- ✅ Implement JWT tokens
- ✅ Add OAuth providers (Google, GitHub)

## Navigation

### Accessing Auth Screens

1. **From Navigation Bar**: Click profile icon → redirects to profile (or sign in if not authenticated)

2. **Direct URLs**:
   - `browzer://signin` - Sign in page
   - `browzer://signup` - Sign up page
   - `browzer://profile` - Profile page

3. **Programmatic**:
   ```typescript
   window.location.hash = '#/signin';
   window.location.hash = '#/signup';
   window.location.hash = '#/profile';
   ```

## Testing the System

### 1. Create a New User
```
1. Navigate to browzer://signup
2. Fill in:
   - Name: Test User
   - Email: test@example.com
   - Password: password123
   - Confirm Password: password123
3. Click "Create Account"
4. Should auto-sign in and redirect to profile
```

### 2. Sign Out and Sign In
```
1. On profile page, click "Sign Out"
2. Redirected to sign in page
3. Enter credentials:
   - Email: test@example.com
   - Password: password123
4. Click "Sign In"
5. Redirected to profile page
```

### 3. Guest Mode
```
1. On sign in page, click "Continue as Guest"
2. Guest account created automatically
3. Redirected to profile
4. Guest email format: guest_[timestamp]@browzer.local
```

### 4. Edit Profile
```
1. On profile page, click "Edit Profile"
2. Change name or email
3. Click "Save Changes"
4. Profile updated
```

### 5. Delete Account
```
1. On profile page, click "Delete Account"
2. Confirm deletion
3. Account deleted
4. Redirected to sign in page
```

## Migration to Backend

When ready to add a backend, you'll need to:

1. **Replace UserService methods** with API calls
2. **Add JWT token handling** for authentication
3. **Implement token refresh** logic
4. **Add OAuth providers** (optional)
5. **Set up email verification** (optional)

See `docs/USER_SERVICE_BACKEND.md` for detailed migration guide.

## Troubleshooting

### Session Not Persisting
- Check electron-store data directory
- Verify session expiration time
- Check console for errors

### Can't Sign In
- Verify user exists in storage
- Check password (currently plain text)
- Look for errors in console

### Profile Not Loading
- Ensure user is signed in
- Check `getCurrentUser()` returns data
- Verify IPC handlers are registered

## Future Enhancements

- [ ] Email verification
- [ ] Password reset flow
- [ ] OAuth providers (Google, GitHub)
- [ ] Two-factor authentication
- [ ] Profile picture upload
- [ ] Account settings page
- [ ] Activity log
- [ ] Connected devices management
- [ ] Export user data (GDPR)

## Related Documentation

- `USER_SERVICE_BACKEND.md` - Backend integration guide
- `INTERNAL_PAGES.md` - Internal pages architecture
- `SETTINGS_ARCHITECTURE.md` - Settings system

---

**Status**: ✅ Fully Implemented (Local Storage)
**Next Step**: Backend Integration (when needed)
