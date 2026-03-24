# ISEE v2 — Phase 2: User Accounts & Billing Layer

**Status**: Future Planning
**Version**: 0.1
**Depends on**: PRODUCTION-LAYER-SPEC.md (Phase 1 must be complete)

---

## Overview

This document outlines the **Phase 2** expansion that transforms ISEE from a production-ready application into a commercial SaaS product with self-service user accounts and usage-based billing.

### Relationship to Phase 1

```
Phase 1 (Production Layer)          Phase 2 (User & Billing)
─────────────────────────          ──────────────────────────
Operator-managed API keys    →     Self-service user accounts
You pay for API usage        →     Users pay for their usage
Internal operational metrics →     User-facing usage dashboard
Rate limits per API key      →     Usage quotas per subscription
```

**Prerequisite**: Complete all Phase 1 components before starting Phase 2. The observability, security foundations, and resilience patterns from Phase 1 are essential infrastructure for a billing system.

---

## Scope Summary

| Component | Description |
|-----------|-------------|
| **Identity System** | Registration, login, password reset, sessions |
| **Billing Engine** | Stripe integration, usage metering, invoicing |
| **Pricing Model** | Per-run, subscription tiers, or credits |
| **User Dashboard** | Usage history, billing management, account settings |
| **Email System** | Transactional emails (verification, receipts, alerts) |
| **Legal Framework** | ToS, Privacy Policy, refund policy |

---

## 1. Identity & Authentication System

### 1.1 Authentication Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Email/Password** | Simple, universal | Password management burden | Required baseline |
| **OAuth (Google, GitHub)** | Frictionless signup | External dependency | Recommended addition |
| **Magic Links** | No passwords | Email delivery dependency | Nice-to-have |

**Recommended**: Email/password + Google OAuth + GitHub OAuth

### 1.2 User Flows

**Registration**:
```
User enters email/password
    ↓
Create unverified account
    ↓
Send verification email
    ↓
User clicks link → Account verified
    ↓
Redirect to onboarding/dashboard
```

**Login**:
```
User enters credentials
    ↓
Validate credentials
    ↓
Create session (JWT or cookie)
    ↓
Redirect to dashboard
```

**Password Reset**:
```
User requests reset
    ↓
Send reset email (time-limited token)
    ↓
User clicks link → Enter new password
    ↓
Invalidate all existing sessions
    ↓
Redirect to login
```

### 1.3 Session Management

**Approach**: HTTP-only cookies with JWT (stateless, secure)

```typescript
interface UserSession {
  userId: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  expiresAt: string;
}
```

**Security**:
- HTTP-only cookies (no JS access)
- Secure flag (HTTPS only)
- SameSite=Strict (CSRF protection)
- Short-lived access tokens (15 min) + refresh tokens (7 days)

### 1.4 Database Schema Additions

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash TEXT, -- NULL if OAuth-only
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Profile
  name TEXT,

  -- Billing
  stripe_customer_id TEXT UNIQUE,
  plan TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  plan_started_at TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TEXT,
  deactivation_reason TEXT
);

-- OAuth Connections
CREATE TABLE oauth_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google', 'github'
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);

-- Email Verification Tokens
CREATE TABLE email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- Password Reset Tokens
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- Sessions (if using database-backed sessions)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  user_agent TEXT,
  ip_address TEXT
);
```

---

## 2. Billing & Payments

### 2.1 Payment Processor

**Choice**: Stripe

**Rationale**:
- Industry standard, excellent documentation
- Handles PCI compliance
- Built-in usage-based billing support
- Webhook system for event handling
- Customer portal for self-service billing management

### 2.2 Pricing Model Options

#### Option A: Per-Run Pricing

```
Pay as you go:
- $0.50 per analysis run
- No monthly commitment
- Charges accumulate, invoiced monthly
```

**Pros**: Simple, aligns cost with value
**Cons**: Unpredictable revenue, high per-transaction friction

#### Option B: Subscription Tiers

```
Free Tier:
- 3 runs per month
- Standard priority
- Community support

Pro Tier ($29/month):
- 50 runs per month
- Priority processing
- Email support
- Run history (90 days)

Enterprise Tier ($99/month):
- Unlimited runs
- Highest priority
- API access
- Run history (1 year)
- Dedicated support
```

**Pros**: Predictable revenue, clear upgrade path
**Cons**: Users may under/over-use their tier

#### Option C: Credits System

```
Buy credits:
- 10 credits = $5
- 50 credits = $20 (20% bonus)
- 100 credits = $35 (30% bonus)

Each analysis = 1 credit
Credits never expire
```

**Pros**: Flexible, encourages bulk purchase
**Cons**: More complex accounting, refund complexity

#### Recommended: Hybrid (Subscription + Overage)

```
Free Tier:
- 5 runs per month
- No credit card required

Pro Tier ($19/month):
- 30 runs included
- $0.40 per additional run
- Full feature access

Enterprise:
- Contact for pricing
- Volume discounts
- Custom integrations
```

### 2.3 Stripe Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ISEE Application                       │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   Signup    │    │  Run Query  │    │  Billing    │    │
│  │   Flow      │    │   Flow      │    │  Dashboard  │    │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│         │                  │                  │            │
│         ▼                  ▼                  ▼            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Billing Service Layer                   │  │
│  │  - Create Stripe customer on signup                  │  │
│  │  - Check usage quota before run                      │  │
│  │  - Record usage after run                            │  │
│  │  - Redirect to Stripe Customer Portal                │  │
│  └──────────────────────────┬──────────────────────────┘  │
│                             │                              │
└─────────────────────────────┼──────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Stripe      │
                    │                 │
                    │ - Customers     │
                    │ - Subscriptions │
                    │ - Usage Records │
                    │ - Invoices      │
                    │ - Payments      │
                    └────────┬────────┘
                             │
                             ▼ (webhooks)
                    ┌─────────────────┐
                    │ Webhook Handler │
                    │                 │
                    │ - payment_succeeded
                    │ - payment_failed │
                    │ - subscription_updated
                    │ - customer.subscription.deleted
                    └─────────────────┘
```

### 2.4 Usage Metering

**When to record usage**:
```typescript
// After successful pipeline completion
async function recordUsage(userId: string, runId: string): Promise<void> {
  const user = await getUser(userId);

  // Record in Stripe for billing
  await stripe.subscriptionItems.createUsageRecord(
    user.stripeSubscriptionItemId,
    {
      quantity: 1,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'increment',
    }
  );

  // Record locally for dashboard
  await db.run(`
    INSERT INTO usage_records (user_id, run_id, recorded_at)
    VALUES (?, ?, ?)
  `, [userId, runId, new Date().toISOString()]);
}
```

**Quota checking**:
```typescript
async function canRunAnalysis(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await getUser(userId);
  const usage = await getMonthlyUsage(userId);

  const limits = {
    free: 5,
    pro: 30,
    enterprise: Infinity,
  };

  const limit = limits[user.plan];

  if (usage >= limit) {
    if (user.plan === 'free') {
      return { allowed: false, reason: 'Free tier limit reached. Upgrade to Pro for more runs.' };
    } else if (user.plan === 'pro') {
      // Pro users can exceed with overage charges
      return { allowed: true };
    }
  }

  return { allowed: true };
}
```

### 2.5 Stripe Webhook Events

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Update user plan, send welcome email |
| `customer.subscription.updated` | Update user plan |
| `customer.subscription.deleted` | Downgrade to free, send retention email |
| `invoice.payment_succeeded` | Record payment, send receipt |
| `invoice.payment_failed` | Send payment failed email, maybe restrict access |
| `customer.subscription.trial_will_end` | Send trial ending reminder |

### 2.6 Database Schema Additions

```sql
-- Usage Records
CREATE TABLE usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  run_id TEXT REFERENCES runs(id),
  recorded_at TEXT NOT NULL,
  billing_period TEXT NOT NULL, -- '2026-03' (year-month)
  billed BOOLEAN DEFAULT FALSE,
  stripe_usage_record_id TEXT
);

-- Subscriptions (local cache of Stripe data)
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY, -- Stripe subscription ID
  user_id TEXT REFERENCES users(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'active', 'past_due', 'canceled', etc.
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Invoices (local cache)
CREATE TABLE invoices (
  id TEXT PRIMARY KEY, -- Stripe invoice ID
  user_id TEXT REFERENCES users(id),
  amount_due INTEGER NOT NULL, -- cents
  amount_paid INTEGER NOT NULL,
  status TEXT NOT NULL,
  invoice_url TEXT,
  created_at TEXT NOT NULL
);

-- Create index for usage queries
CREATE INDEX idx_usage_user_period ON usage_records(user_id, billing_period);
```

---

## 3. User Dashboard

### 3.1 Dashboard Sections

**Account Overview**:
- Current plan
- Usage this month (X of Y runs)
- Usage bar/progress indicator
- Quick action: Run new analysis

**Run History**:
- List of past runs with status
- Click to view briefing
- Filter by date range
- Search by query

**Billing**:
- Current plan details
- Next billing date
- Payment method (last 4 digits)
- "Manage Billing" → Stripe Customer Portal
- Invoice history

**Settings**:
- Profile (name, email)
- Password change
- Connected accounts (OAuth)
- API keys (if Pro/Enterprise)
- Delete account

### 3.2 Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  ISEE                                    joseph@email.com ▼ │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Welcome back, Joseph                                       │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Pro Plan       │  │  Usage          │  │  Next Bill  │ │
│  │  $19/month      │  │  12 / 30 runs   │  │  Apr 1      │ │
│  │  [Manage]       │  │  ████████░░░░░  │  │  $19.00     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  [+ New Analysis]                                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Recent Analyses                                            │
│  ───────────────────────────────────────────────────────── │
│  ✓ Mar 24  How might we improve decision-making...  [View] │
│  ✓ Mar 23  What approaches help distributed teams... [View] │
│  ✓ Mar 22  How can I design a creative workflow...   [View] │
│  ✓ Mar 20  What are effective strategies for...      [View] │
│                                                             │
│  [View All Runs →]                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 New API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/register` | POST | No | Create account |
| `/auth/login` | POST | No | Login |
| `/auth/logout` | POST | Yes | Logout |
| `/auth/verify-email` | GET | No | Verify email token |
| `/auth/forgot-password` | POST | No | Request reset |
| `/auth/reset-password` | POST | No | Reset with token |
| `/auth/oauth/:provider` | GET | No | OAuth redirect |
| `/auth/oauth/:provider/callback` | GET | No | OAuth callback |
| `/api/user` | GET | Yes | Get current user |
| `/api/user` | PATCH | Yes | Update profile |
| `/api/user/password` | PUT | Yes | Change password |
| `/api/user/runs` | GET | Yes | List user's runs |
| `/api/user/usage` | GET | Yes | Usage statistics |
| `/api/billing/portal` | POST | Yes | Get Stripe portal URL |
| `/api/billing/checkout` | POST | Yes | Create checkout session |
| `/api/billing/subscription` | GET | Yes | Get subscription status |
| `/webhooks/stripe` | POST | No* | Stripe webhooks |

*Stripe webhooks use signature verification instead of user auth

---

## 4. Email System

### 4.1 Transactional Email Provider

**Options**: Resend, SendGrid, Postmark, AWS SES

**Recommendation**: Resend (modern API, good deliverability, reasonable pricing)

### 4.2 Email Templates

| Email | Trigger | Content |
|-------|---------|---------|
| **Welcome** | Registration | Welcome, verify email link |
| **Email Verification** | Registration / email change | Verification link |
| **Password Reset** | Forgot password | Reset link (expires in 1 hour) |
| **Subscription Started** | New Pro/Enterprise | Welcome to plan, features overview |
| **Payment Receipt** | Payment succeeded | Invoice details, amount |
| **Payment Failed** | Payment failed | Update payment method link |
| **Usage Alert** | 80% of quota used | Upgrade prompt |
| **Quota Exceeded** | Free tier limit hit | Upgrade prompt |
| **Trial Ending** | 3 days before trial end | Convert to paid prompt |
| **Subscription Canceled** | Cancellation | Offboarding, feedback request |

### 4.3 Email Template Structure

```typescript
interface EmailTemplate {
  subject: string;
  preheader: string; // Preview text
  body: {
    greeting: string;
    content: string[];
    cta?: {
      text: string;
      url: string;
    };
    footer: string;
  };
}
```

---

## 5. Legal & Compliance

### 5.1 Required Documents

| Document | Purpose | Notes |
|----------|---------|-------|
| **Terms of Service** | Legal agreement | Acceptable use, liability limits |
| **Privacy Policy** | Data handling | GDPR/CCPA compliant |
| **Refund Policy** | Payment disputes | Clear refund conditions |
| **Cookie Policy** | Cookie consent | If using analytics |

### 5.2 Privacy Considerations

**Data collected**:
- Account info (email, name)
- Usage data (queries, runs)
- Payment info (handled by Stripe)
- Analytics (if implemented)

**User rights** (GDPR):
- Right to access (export data)
- Right to deletion (delete account)
- Right to portability (export in standard format)
- Right to rectification (edit profile)

**Data retention**:
- Account data: Until deletion requested
- Run data: Per plan (Free: 30 days, Pro: 90 days, Enterprise: 1 year)
- Payment data: As required by law (typically 7 years)

### 5.3 Compliance Checklist

- [ ] Terms of Service drafted and reviewed
- [ ] Privacy Policy drafted and reviewed
- [ ] Cookie consent banner (if using cookies beyond essential)
- [ ] Email consent checkbox on registration
- [ ] Account deletion flow implemented
- [ ] Data export flow implemented
- [ ] Stripe PCI compliance verified
- [ ] SSL/TLS on all endpoints
- [ ] Secure password hashing (Argon2id)
- [ ] Rate limiting on auth endpoints
- [ ] Audit logging for sensitive operations

---

## 6. Implementation Phases

### Phase 2a: Identity System (2-3 weeks)

- [ ] User database schema
- [ ] Registration flow (email/password)
- [ ] Email verification
- [ ] Login/logout with sessions
- [ ] Password reset flow
- [ ] Basic user dashboard (profile, runs)
- [ ] Migrate from API keys to user sessions

**Deliverable**: Users can create accounts and log in

### Phase 2b: OAuth Integration (1 week)

- [ ] Google OAuth integration
- [ ] GitHub OAuth integration
- [ ] Link/unlink OAuth accounts
- [ ] OAuth account merging logic

**Deliverable**: Social login working

### Phase 2c: Billing Foundation (2-3 weeks)

- [ ] Stripe account setup
- [ ] Customer creation on signup
- [ ] Subscription checkout flow
- [ ] Webhook handler
- [ ] Usage metering
- [ ] Quota enforcement
- [ ] Stripe Customer Portal integration

**Deliverable**: Users can subscribe and pay

### Phase 2d: User Dashboard (1-2 weeks)

- [ ] Usage statistics
- [ ] Run history with pagination
- [ ] Billing section
- [ ] Plan upgrade/downgrade UI
- [ ] Invoice history

**Deliverable**: Full self-service dashboard

### Phase 2e: Email System (1 week)

- [ ] Email provider integration
- [ ] All transactional email templates
- [ ] Email sending service
- [ ] Unsubscribe handling

**Deliverable**: Automated email communications

### Phase 2f: Legal & Polish (1 week)

- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Cookie consent (if needed)
- [ ] Account deletion flow
- [ ] Data export flow
- [ ] Final security audit

**Deliverable**: Legally compliant, ready for public launch

---

## 7. Tool Decisions

| Category | Tool | Rationale |
|----------|------|-----------|
| **Auth library** | Custom or Lucia | Lucia is lightweight, good for Bun |
| **Password hashing** | Argon2id (via @node-rs/argon2) | Current best practice |
| **Sessions** | JWT in HTTP-only cookies | Stateless, secure |
| **OAuth** | Arctic | Lightweight OAuth library |
| **Payments** | Stripe | Industry standard |
| **Email** | Resend | Modern API, good DX |
| **Email templates** | React Email or MJML | Responsive email templates |

---

## 8. Cost Estimates

### Operational Costs

| Service | Free Tier | Estimated Monthly (1000 users) |
|---------|-----------|-------------------------------|
| Stripe | 2.9% + $0.30 per transaction | ~$100 (at $500 revenue) |
| Resend | 3,000 emails/month free | $20 (10k emails) |
| Database | SQLite (free) | $0 |
| Hosting | Same as Phase 1 | +$0 |

### Revenue Model (Example)

```
Assumptions:
- 1000 registered users
- 5% conversion to Pro ($19/month)
- Average 20 runs/month for Pro users

Monthly Revenue:
- 50 Pro users × $19 = $950
- Overage (10 users × 10 extra runs × $0.40) = $40
- Total: $990

Monthly Costs:
- API costs (50 users × 20 runs × ~$0.30) = $300
- Stripe fees (~3%) = $30
- Email = $20
- Hosting = $20
- Total: $370

Net: ~$620/month
```

---

## 9. Success Criteria

### Functional

| Requirement | Metric |
|-------------|--------|
| Registration → first run | < 2 minutes |
| Login latency | < 500ms |
| Payment success rate | > 99% |
| Webhook processing | < 5 seconds |
| Email delivery | > 98% |

### Business

| Metric | Target (Month 3) |
|--------|------------------|
| Registered users | 500 |
| Free → Pro conversion | 5% |
| Churn rate | < 10% |
| MRR | $500 |

### Portfolio Demonstration

| Skill | Evidence |
|-------|----------|
| SaaS architecture | Multi-tenant user system |
| Payment integration | Stripe subscription + usage billing |
| Security (elevated) | Auth flows, PII handling |
| Product thinking | Pricing tiers, upgrade flows |
| Legal awareness | ToS, Privacy Policy, GDPR |

---

## 10. Open Questions (To Resolve Before Starting)

1. **Pricing model**: Per-run, subscription, or hybrid?
2. **Free tier limits**: How generous? (Affects conversion)
3. **Trial period**: Offer Pro trial? How long?
4. **Refund policy**: Full refund window? Prorated?
5. **Enterprise tier**: Self-serve or sales-led?
6. **API access**: Include in Pro, or Enterprise only?
7. **Team accounts**: Support multiple users per subscription?

---

*This document will be expanded with detailed specifications when Phase 2 begins.*
*Estimated Phase 2 timeline: 8-10 weeks after Phase 1 completion.*

---

*Last updated: March 2026*
