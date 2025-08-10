# 📧 Email/OTP Backend Integration Guide

## 🎯 Overview

Browzer now includes a comprehensive email/OTP backend integration system that enables:

- **Email Verification** during onboarding with OTP codes
- **User Account Management** with secure sessions
- **Multiple Email Providers** (SMTP, SendGrid, Mailgun, Resend)
- **Professional Email Templates** with branded OTP emails
- **Rate Limiting & Security** with attempt limits and expiry times

## 🚀 Quick Start

### 1. Development Mode (No Setup Required)
In development mode, the system works without any email configuration:
- OTP codes are logged to the console
- Any 6-digit code will work for verification
- Perfect for testing the onboarding flow

### 2. Production Setup
For production, configure a real email service:

1. **Open Email Configuration**:
   - Access via the settings page or directly open `email-config.html`
   - Choose from SMTP, SendGrid, Mailgun, or Resend

2. **Configure Your Provider**:
   - **SMTP**: Use Gmail, Outlook, or custom SMTP server
   - **SendGrid**: Requires API key from SendGrid dashboard
   - **Mailgun**: Requires API key and domain
   - **Resend**: Requires API key from Resend

3. **Test Configuration**:
   - Click "Test Configuration" to verify settings
   - Save once confirmed working

## 📋 Email Provider Setup

### Gmail SMTP Setup
```
Host: smtp.gmail.com
Port: 587
Security: STARTTLS
Username: your-email@gmail.com
Password: [App Password - not your regular password]
```

**Important**: Enable 2FA and create an App Password in Google Account settings.

### SendGrid Setup
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Generate API key in Settings > API Keys
3. Verify sender email in Settings > Sender Authentication

### Mailgun Setup
1. Create account at [mailgun.com](https://mailgun.com)
2. Add and verify your domain
3. Get API key from Settings > API Keys

### Resend Setup
1. Create account at [resend.com](https://resend.com)
2. Add and verify your domain
3. Generate API key in Settings > API Keys

## 🔧 Technical Architecture

### Services Overview

#### EmailService (`src/main/services/EmailService.ts`)
- **OTP Generation**: Secure 6-digit codes with crypto.randomInt
- **Email Templates**: Professional HTML emails with branding
- **Rate Limiting**: 1 minute between OTP requests
- **Expiry Management**: 10-minute OTP validity
- **Multi-Provider Support**: Unified interface for different email services

#### UserService (`src/main/services/UserService.ts`)
- **User Management**: Create, verify, and manage user accounts
- **Session Management**: Secure sessions with 30-day expiry
- **Preferences Storage**: Sidebar, adblock, theme, API keys
- **Profile Management**: User profile data and settings

### Data Storage
- **Users**: `userData/users.json` - User accounts and preferences
- **Sessions**: `userData/sessions.json` - Active user sessions
- **Email Config**: `userData/email-config.json` - Email service settings
- **Verified Users**: `userData/verified-users.json` - Email verification log

### IPC Handlers
```javascript
// Email Operations
'send-otp' - Send OTP to email
'verify-otp' - Verify OTP code
'configure-email-service' - Save email config
'test-email-config' - Test email settings

// User Operations
'create-user' - Create new user account
'login-user' - Login and create session
'validate-session' - Validate existing session
'update-user-preferences' - Update user settings
'get-current-user' - Get logged-in user
'logout-user' - Logout and end session
```

## 🎨 Email Templates

The system includes beautiful, branded email templates:

- **Cosmic Background**: Matches Browzer's futuristic design
- **Responsive Design**: Works on all email clients
- **Clear OTP Display**: Large, easy-to-read verification codes
- **Professional Branding**: Consistent with Browzer identity
- **Security Information**: Clear expiry and security messaging

## 🔒 Security Features

### OTP Security
- **Cryptographically Secure**: Uses `crypto.randomInt()` for OTP generation
- **Time-Limited**: 10-minute expiry on all codes
- **Attempt Limiting**: Maximum 3 verification attempts
- **Rate Limiting**: 1-minute cooldown between OTP requests

### Session Security
- **UUID Sessions**: Cryptographically secure session IDs
- **Auto-Expiry**: 30-day session lifetime
- **Activity Tracking**: Last activity timestamps
- **Cleanup Tasks**: Automatic expired session removal

### Data Protection
- **Local Storage**: All data stored locally in userData directory
- **No Cloud Dependencies**: User data never leaves the device
- **Encrypted Configs**: API keys stored securely

## 🧪 Testing

### Run the Demo Script
```bash
node test-email-demo.js
```

This will:
1. Initialize email and user services
2. Create a test user
3. Send OTP (logged to console in dev mode)
4. Verify OTP and create session
5. Test preferences and user management
6. Display comprehensive results

### Manual Testing
1. Start Browzer in development mode
2. Go through onboarding flow
3. Enter any email address
4. Check console for OTP code
5. Enter the OTP to complete verification

## 🔧 Configuration Options

### Email Service Configuration
```typescript
interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun' | 'resend';
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string; };
  };
  apiKey?: string;
  from: string;        // From email address
  fromName: string;    // From display name
}
```

### User Preferences
```typescript
interface UserPreferences {
  sidebar: boolean;     // Show/hide sidebar
  adblock: boolean;     // Enable/disable ad blocker
  theme: 'dark' | 'light';  // UI theme
  apiKeys: Record<string, string>;  // AI service API keys
  importedBrowsers: string[];  // Imported browser data
}
```

## 🚨 Troubleshooting

### Common Issues

**"Failed to send OTP"**
- Check email configuration settings
- Verify API keys are correct
- Test email configuration first

**"Invalid verification code"**
- Check if OTP has expired (10 minutes)
- Verify correct 6-digit code
- Try requesting a new OTP

**"Session expired"**
- Sessions last 30 days
- User needs to log in again
- Check session validation in console

### Debug Mode
Enable detailed logging by setting:
```javascript
process.env.DEBUG_EMAIL = 'true';
```

## 🎯 Integration with Onboarding

The enhanced onboarding flow now includes:

1. **Step 1**: Email verification with real backend OTP
2. **Step 2**: Browser settings saved to user preferences
3. **Step 3**: Chrome import (ready for real browser data APIs)
4. **Automatic Login**: User session created after email verification
5. **Preference Sync**: All onboarding choices saved to user profile

## 📈 Future Enhancements

Planned improvements:
- **Browser Data Import**: Real Chrome/Edge/Brave data import
- **Email Templates**: Customizable email designs
- **Advanced Security**: 2FA, device management
- **Analytics**: User engagement and onboarding metrics
- **Cloud Sync**: Optional cloud backup for user data

## 🎉 Ready to Use!

The email/OTP backend integration is now fully functional and ready for production use. The onboarding flow will automatically use these services, providing a professional user experience with proper email verification and account management.

Configure your email service and start onboarding users with confidence! 🚀
