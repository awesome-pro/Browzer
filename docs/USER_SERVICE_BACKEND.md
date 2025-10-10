# User Service & Backend Integration Guide

## Current Implementation

The UserService is currently implemented with **local storage** using `electron-store`. This provides:
- ✅ User profile management
- ✅ Session persistence across app restarts
- ✅ Subscription status tracking
- ✅ Offline-first functionality

## Architecture Overview

```
┌─────────────────┐
│  Renderer       │
│  (Profile UI)   │
└────────┬────────┘
         │ IPC
         ↓
┌─────────────────┐
│  Main Process   │
│  UserService    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ electron-store  │
│ (Local Storage) │
└─────────────────┘
```

## Future Backend Requirements

### 1. **Authentication Service** (Required)

**Purpose**: Secure user authentication with industry-standard practices

**Options**:
- **Firebase Authentication** (Recommended for quick start)
  - Pros: Easy setup, handles OAuth, email verification, password reset
  - Cons: Vendor lock-in, limited customization
  - Cost: Free tier generous, scales with usage
  
- **Auth0** (Enterprise-grade)
  - Pros: Highly customizable, enterprise features, compliance-ready
  - Cons: More complex, higher cost
  - Cost: Free for 7,000 users, then paid plans
  
- **Custom Backend** (Maximum control)
  - Pros: Full control, no vendor lock-in
  - Cons: More development time, security responsibility
  - Tech Stack: Node.js + Express + JWT + bcrypt

**What You Need**:
```typescript
// Authentication API endpoints
POST   /api/auth/signup          // Create new user
POST   /api/auth/login           // Sign in user
POST   /api/auth/logout          // Sign out user
POST   /api/auth/refresh-token   // Refresh JWT token
POST   /api/auth/forgot-password // Password reset
POST   /api/auth/verify-email    // Email verification
GET    /api/auth/me              // Get current user
```

**Implementation Changes**:
```typescript
// UserService.ts - Replace local storage with API calls
public async signIn(email: string, password: string): Promise<{ user: User; session: Session }> {
  // Call backend API
  const response = await fetch('https://api.yourdomain.com/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  const { user, token, refreshToken } = await response.json();
  
  // Store tokens securely
  await safeStorage.setPassword('access_token', token);
  await safeStorage.setPassword('refresh_token', refreshToken);
  
  // Create local session
  const session = this.createSession(user.id);
  this.currentUser = user;
  this.currentSession = session;
  
  return { user, session };
}
```

### 2. **Database** (Required)

**Purpose**: Store user data, profiles, preferences, and subscription info

**Options**:
- **PostgreSQL** (Recommended for relational data)
  - Best for: User profiles, subscriptions, complex queries
  - Hosting: Supabase, Railway, Render, AWS RDS
  
- **MongoDB** (Good for flexible schemas)
  - Best for: Rapid prototyping, document-based data
  - Hosting: MongoDB Atlas (free tier available)
  
- **Firebase Firestore** (Easiest setup)
  - Best for: Quick start, real-time features
  - Hosting: Google Cloud (generous free tier)

**Schema Example** (PostgreSQL):
```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  password_hash TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP,
  last_login_at TIMESTAMP,
  metadata JSONB
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  device_info JSONB
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- 'free', 'trial', 'active', 'expired', 'cancelled'
  plan VARCHAR(50), -- 'basic', 'pro', 'enterprise'
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  trial_ends_at TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User preferences table
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(20) DEFAULT 'system',
  language VARCHAR(10) DEFAULT 'en',
  notifications BOOLEAN DEFAULT TRUE,
  preferences JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. **Payment Processing** (For Subscriptions)

**Purpose**: Handle subscription payments and billing

**Recommended**: **Stripe** (Industry standard)
- Pros: Comprehensive, well-documented, handles compliance
- Cons: Transaction fees (2.9% + 30¢)
- Features: Subscriptions, invoices, customer portal, webhooks

**What You Need**:
```typescript
// Stripe integration
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create subscription
const subscription = await stripe.subscriptions.create({
  customer: user.stripeCustomerId,
  items: [{ price: 'price_pro_monthly' }],
  trial_period_days: 7,
});

// Webhook to handle subscription events
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );
  
  switch (event.type) {
    case 'customer.subscription.created':
      // Update user subscription status
      break;
    case 'customer.subscription.deleted':
      // Handle cancellation
      break;
    case 'invoice.payment_failed':
      // Handle failed payment
      break;
  }
  
  res.json({ received: true });
});
```

### 4. **Backend API Server** (Required)

**Tech Stack Recommendation**:
```
Node.js + Express + TypeScript
├── Authentication (JWT)
├── Database ORM (Prisma or TypeORM)
├── Validation (Zod)
├── Rate Limiting (express-rate-limit)
└── Error Handling (custom middleware)
```

**API Structure**:
```
/api
├── /auth
│   ├── POST /signup
│   ├── POST /login
│   ├── POST /logout
│   ├── POST /refresh-token
│   └── POST /verify-email
├── /users
│   ├── GET /me
│   ├── PATCH /me
│   ├── DELETE /me
│   └── PATCH /preferences
├── /subscriptions
│   ├── GET /current
│   ├── POST /create
│   ├── POST /cancel
│   └── POST /upgrade
└── /webhooks
    └── POST /stripe
```

**Deployment Options**:
- **Vercel** (Serverless, easy deployment)
- **Railway** (Full-stack, includes database)
- **Render** (Simple, affordable)
- **AWS/GCP** (Enterprise-grade, more complex)

### 5. **Secure Token Storage** (Critical)

**Current**: Storing session in electron-store (unencrypted)

**Upgrade to**: Electron's `safeStorage` API
```typescript
import { safeStorage } from 'electron';

// Store tokens securely
const encryptedToken = safeStorage.encryptString(accessToken);
await store.set('encrypted_token', encryptedToken.toString('base64'));

// Retrieve tokens
const encryptedBuffer = Buffer.from(store.get('encrypted_token'), 'base64');
const decryptedToken = safeStorage.decryptString(encryptedBuffer);
```

### 6. **Email Service** (For Verification & Notifications)

**Options**:
- **SendGrid** (Recommended)
  - Free tier: 100 emails/day
  - Easy API, good deliverability
  
- **AWS SES** (Cost-effective at scale)
  - $0.10 per 1,000 emails
  - Requires domain verification
  
- **Resend** (Developer-friendly)
  - Modern API, React email templates
  - Free tier: 3,000 emails/month

**Use Cases**:
- Email verification
- Password reset
- Subscription notifications
- Billing alerts

## Migration Path

### Phase 1: Keep Local Storage (Current)
- ✅ Works offline
- ✅ No backend costs
- ✅ Fast development
- ❌ No sync across devices
- ❌ No real authentication

### Phase 2: Add Backend Authentication
1. Set up backend API (Node.js + Express)
2. Set up database (PostgreSQL on Supabase)
3. Implement JWT authentication
4. Update UserService to call API instead of local storage
5. Keep local caching for offline support

### Phase 3: Add Subscription Management
1. Integrate Stripe
2. Create subscription plans
3. Add payment UI
4. Implement webhooks
5. Handle subscription lifecycle

### Phase 4: Advanced Features
1. OAuth providers (Google, GitHub)
2. Multi-device sync
3. Team/organization support
4. Usage analytics
5. Admin dashboard

## Cost Estimates

### Minimal Setup (Hobby/MVP)
- **Hosting**: Vercel/Railway Free Tier = $0
- **Database**: Supabase Free Tier = $0
- **Auth**: Firebase Auth Free Tier = $0
- **Email**: SendGrid Free Tier = $0
- **Total**: **$0/month** (up to ~1,000 users)

### Production Setup (Growing Business)
- **Hosting**: Railway Pro = $20/month
- **Database**: Supabase Pro = $25/month
- **Auth**: Auth0 = $35/month (up to 1,000 users)
- **Email**: SendGrid = $20/month (40,000 emails)
- **Stripe**: 2.9% + 30¢ per transaction
- **Total**: **~$100/month** + transaction fees

### Enterprise Setup
- **Hosting**: AWS/GCP = $200-500/month
- **Database**: AWS RDS = $100-300/month
- **CDN**: CloudFlare = $20-200/month
- **Monitoring**: DataDog = $100-500/month
- **Total**: **$500-1,500/month**

## Security Best Practices

1. **Password Hashing**: Use bcrypt with salt rounds ≥ 12
2. **JWT Tokens**: Short-lived access tokens (15 min), long-lived refresh tokens (30 days)
3. **HTTPS Only**: All API calls must use HTTPS
4. **Rate Limiting**: Prevent brute force attacks
5. **Input Validation**: Validate all user input
6. **SQL Injection**: Use parameterized queries
7. **CORS**: Configure proper CORS policies
8. **Secrets**: Use environment variables, never commit secrets

## Recommended Stack (Quick Start)

```
Frontend (Electron):
├── UserService (current implementation)
└── API Client (fetch/axios)

Backend:
├── Vercel (hosting)
├── Supabase (database + auth)
├── Stripe (payments)
└── SendGrid (emails)
```

This stack gets you:
- ✅ Production-ready in days
- ✅ Generous free tiers
- ✅ Easy to scale
- ✅ Minimal maintenance
- ✅ Great developer experience

## Next Steps

1. **Choose your backend approach** (Firebase vs Custom)
2. **Set up database** (Supabase recommended)
3. **Implement API endpoints** (Start with auth)
4. **Update UserService** (Replace local storage with API calls)
5. **Add Stripe** (When ready for subscriptions)
6. **Deploy** (Vercel/Railway)

The current UserService architecture is designed to make this migration smooth - you'll mainly be swapping out the storage layer while keeping the same API surface for the renderer process.
