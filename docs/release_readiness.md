# Release Readiness Checklist

This document tracks items that must be completed before production release.

## 🔴 Critical - Must Complete Before Release

### Authentication Configuration

| Item                        | Status     | Description                                             |
| --------------------------- | ---------- | ------------------------------------------------------- |
| **Social Login Keys**       | ⏳ Pending | Configure OAuth keys for Google, Apple, and Facebook    |
| **Remove Mock Mode**        | ⏳ Pending | Remove forced mock login in `auth-hook.ts`              |
| **Supabase Production URL** | ⏳ Pending | Update `.env` with production Supabase URL and Anon Key |
| **Remove Dev OTP Display**  | ⏳ Pending | Remove Inbucket OTP fetch code (dev-only)               |

### Current Mock Behavior

The following authentication behaviors are **mocked** for development:

1. **Social Login (Google/Apple/Facebook)**
   - File: `packages/app/features/auth/auth-hook.ts`
   - Current: Falls back to password login with `mock@social.com`
   - Required: Configure real OAuth with provider keys

2. **Email OTP Display**
   - File: `packages/app/features/auth/auth-hook.ts`
   - Current: Fetches OTP from local Inbucket for dev testing
   - Required: Remove this block for production

### Required Environment Variables

```bash
# Production Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key

# OAuth Providers (configure in Supabase Dashboard)
# - Google: Client ID and Secret
# - Apple: Service ID and Key
# - Facebook: App ID and Secret
```

---

## 🟡 Recommended Before Release

| Item                   | Status     | Description                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATS Hardening          | ⏳ Pending | Remove `NSAllowsArbitraryLoads: true` from iOS `app.json`                                                                                                                                                                                                                                |
| Debug Alerts           | ⏳ Pending | Review and remove any remaining `alert()` calls                                                                                                                                                                                                                                          |
| Console Logs           | ⏳ Pending | Remove verbose dev logging (🔧, 🤖, etc.)                                                                                                                                                                                                                                                |
| **Media Optimization** | ⏳ Pending | Compress avatars (400px, 80% JPEG) & videos (`react-native-compressor`, auto mode, 720p max) before upload. Code was written & reverted (`fd6cef3` → `45503b5`) — re-apply and test on physical device before release. See `implementation_plan.md` in brain artifacts for full details. |

---

## 🟢 Verified Ready

| Item                                | Status   |
| ----------------------------------- | -------- |
| Profile creation trigger            | ✅ Works |
| 50pt signup reward                  | ✅ Works |
| Email/OTP flow (UI)                 | ✅ Works |
| Navigation (Login → Success → Home) | ✅ Works |
| Localization (EN/ES/VI)             | ✅ Works |

---

_Last Updated: 2026-02-01_
