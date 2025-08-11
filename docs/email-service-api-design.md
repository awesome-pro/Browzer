# 📧 Browzer Email Service API

## 🎯 Purpose
A secure, stateless email service API for sending OTP verification emails for Browzer browser onboarding.

## 🏗️ Architecture

### Security Model
- **Client-side OTP generation**: Browzer generates and stores OTP locally
- **Server-side email sending**: API only sends emails, never stores OTPs
- **Stateless design**: No user data stored on server
- **Rate limiting**: Prevent abuse with IP-based limits

### API Endpoints

#### `POST /api/send-otp`
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "clientId": "browzer-desktop" // Optional: for analytics
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "messageId": "sendgrid-message-id" // For tracking
}
```

#### `GET /api/health`
Health check endpoint for monitoring

#### `GET /api/stats` (Optional)
Basic usage statistics (no personal data)

## 🔧 Tech Stack

### Backend
- **Node.js + Express**: Fast, lightweight API
- **SendGrid**: Professional email delivery
- **Rate Limiting**: express-rate-limit
- **CORS**: Configured for Browzer origins
- **Helmet**: Security headers

### Deployment
- **Heroku**: Easy deployment and scaling
- **Environment Variables**: All secrets in Heroku config
- **Custom Domain**: api.browzer.com (optional)

## 📁 Repository Structure

```
email-service/
├── src/
│   ├── routes/
│   │   ├── send-otp.js
│   │   ├── health.js
│   │   └── stats.js
│   ├── middleware/
│   │   ├── rateLimiter.js
│   │   ├── validation.js
│   │   └── cors.js
│   ├── services/
│   │   └── emailService.js
│   ├── templates/
│   │   └── otp-email.html
│   └── app.js
├── tests/
│   ├── send-otp.test.js
│   └── integration.test.js
├── .env.example
├── package.json
├── Procfile
├── README.md
└── heroku.yml
```

## 🔒 Security Features

### Rate Limiting
- 5 requests per minute per IP
- 100 requests per hour per IP
- Configurable limits via environment

### Input Validation
- Email format validation
- OTP format validation (6 digits)
- Request size limits

### CORS Configuration
- Only allow requests from Browzer origins
- Production: browzer.com, app.browzer.com
- Development: localhost:3000, localhost:8080

### Environment Variables
```
SENDGRID_API_KEY=SG.xxx
FROM_EMAIL=noreply@browzer.com
FROM_NAME=Browzer Team
ALLOWED_ORIGINS=https://browzer.com,http://localhost:3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=5
```

## 📧 Email Template

### Professional OTP Email
- Browzer branding
- Clear OTP display
- Security messaging
- Mobile-responsive design
- Expiry information

## 🚀 Deployment Steps

### 1. Heroku Setup
```bash
heroku create browzer-email-service
heroku config:set SENDGRID_API_KEY=SG.your_key_here
heroku config:set FROM_EMAIL=noreply@browzer.com
```

### 2. SendGrid Configuration
- Verify sender domain
- Set up API key with mail.send permissions
- Configure webhook for delivery tracking (optional)

### 3. Custom Domain (Optional)
```bash
heroku domains:add api.browzer.com
# Configure DNS CNAME: api.browzer.com → browzer-email-service.herokuapp.com
```

## 🧪 Testing Strategy

### Unit Tests
- Email service functions
- Validation middleware
- Rate limiting logic

### Integration Tests
- Full API endpoint testing
- SendGrid integration
- Error handling scenarios

### Load Testing
- Rate limit effectiveness
- Performance under load
- Heroku dyno scaling

## 📊 Monitoring

### Heroku Metrics
- Response times
- Error rates
- Dyno usage

### SendGrid Analytics
- Delivery rates
- Open rates (optional)
- Bounce tracking

### Custom Logging
- Request logs (no personal data)
- Error tracking
- Usage patterns

## 🔄 Client Integration

### Browzer Changes
```typescript
// Replace direct email sending with API call
async sendOTP(email: string, otp: string) {
  const response = await fetch('https://api.browzer.com/api/send-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      otp,
      clientId: 'browzer-desktop'
    })
  });
  
  return await response.json();
}
```

## 💰 Cost Estimation

### Heroku
- Hobby Dyno: $7/month (1000 hours)
- Professional: $25/month (unlimited)

### SendGrid
- Free: 100 emails/day
- Essentials: $14.95/month (40,000 emails)

### Total: ~$7-40/month depending on usage

## 🎯 Benefits

### Security
- ✅ No credentials in client
- ✅ Stateless server design
- ✅ Rate limiting protection
- ✅ CORS restrictions

### Scalability
- ✅ Heroku auto-scaling
- ✅ SendGrid reliability
- ✅ Stateless horizontal scaling
- ✅ CDN-friendly responses

### Maintainability
- ✅ Single responsibility
- ✅ Easy to update/deploy
- ✅ Clear API contract
- ✅ Comprehensive testing

## 🚀 Next Steps

1. **Create repository structure**
2. **Implement core API endpoints**
3. **Set up SendGrid integration**
4. **Deploy to Heroku**
5. **Update Browzer client**
6. **Add monitoring & analytics**
