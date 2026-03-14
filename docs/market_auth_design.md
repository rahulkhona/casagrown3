# Market Auth & ToS Design

## Overview

The Market app uses Supabase Auth (GoTrue) with **email OTP** (magic link) for
passwordless authentication. ToS acceptance is tracked on the shared `profiles`
table via the `tos_accepted_at` column.

## Auth Flow

### 1. Email Entry

User enters their email on `/login`. The app calls:

```typescript
const { error } = await supabase.auth.signInWithOtp({ email })
```

Supabase generates a 6-digit OTP and sends it via the branded email template
(`supabase/templates/magic_link.html`). In local dev, the email appears in
Mailpit at `http://localhost:54324`.

### 2. OTP Verification

User enters the 6-digit code. The app calls:

```typescript
const { data, error } = await supabase.auth.verifyOtp({
  email,
  token: otp,
  type: 'email'
})
```

On success, Supabase returns a session with JWT. The `handle_new_user()`
trigger auto-creates a `profiles` row if this is a new user.

### 3. ToS Check

After OTP verification, the app queries the user's profile:

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('tos_accepted_at')
  .eq('id', user.id)
  .single()
```

- If `tos_accepted_at` is `null` → redirect to `/terms`
- If `tos_accepted_at` is set → redirect to `/my-booth`

### 4. ToS Acceptance

On the `/terms` page, when the user clicks "I Accept":

```typescript
await supabase
  .from('profiles')
  .update({ tos_accepted_at: new Date().toISOString() })
  .eq('id', user.id)
```

This records the exact timestamp of acceptance.

## Email Configuration

### Production (Postmark)

```toml
[auth.email.smtp]
host = "smtp.postmarkapp.com"
port = 587
user = "env(POSTMARK_SERVER_TOKEN)"
pass = "env(POSTMARK_SERVER_TOKEN)"
admin_email = "noreply@casagrown.dev"
sender_name = "CasaGrown"
```

### Local Development (Mailpit)

Emails are caught by the Mailpit service (Supabase local dev stack):
- **SMTP**: `localhost:54325`
- **Web UI**: `http://localhost:54324`

No configuration needed — this is the default when `[auth.email.smtp]` is
commented out in `config.toml`.

## Rate Limiting

Supabase Auth has built-in rate limiting (configured in `config.toml`):

| Limit                | Value  |
| :------------------- | :----- |
| Emails per hour      | 100    |
| Sign-in attempts/5m  | 30     |
| OTP verifications/5m | 30     |

## Protected Routes

The auth guard pattern for market pages:

```typescript
// Middleware or layout-level check
const { data: { session } } = await supabase.auth.getSession()
if (!session) redirect('/login')

const { data: profile } = await supabase
  .from('profiles')
  .select('tos_accepted_at')
  .eq('id', session.user.id)
  .single()

if (!profile?.tos_accepted_at) redirect('/terms')
```

## Security Notes

- OTP codes expire after 1 hour (`otp_expiry = 3600` in config)
- Refresh token rotation is enabled
- New user profiles are auto-created by the `handle_new_user()` DB trigger
- ToS acceptance timestamp provides legal audit trail
