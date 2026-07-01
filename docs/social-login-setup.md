# Social Login Subdomain Configuration Guide

This document contains step-by-step setup instructions for configuring Google and Apple OAuth logins on your staging and production subdomains.

---

## 1. Supabase Console Configurations
1. Go to your **[Supabase Dashboard](https://supabase.com/dashboard)**.
2. Select your project and navigate to **Authentication → URL Configuration**.
3. Under **Redirect URLs**, add the following callback URI patterns:
   * `https://admin-staging.casagrown.com/**`
   * `https://admin.casagrown.com/**`
   * `https://voice-staging.casagrown.com/**`
   * `https://voice.casagrown.com/**`
   * `https://metrics-staging.casagrown.com/**`
   * `https://metrics.casagrown.com/**`
   * `https://pro.casagrown.com/**`
   * `http://localhost:3001/**` (Local Admin dev)
   * `http://localhost:3002/**` (Local Voice dev)
   * `http://localhost:3003/**` (Local Metrics dev)
4. Click **Save**.

---

## 2. Google Cloud Console Configurations
1. Go to the **[Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials)**.
2. Select your project and locate your **OAuth 2.0 Web Client ID** credential (usually named "Web client" or similar).
3. Under **Authorized JavaScript Origins**, add:
   * `https://casagrown.com`
   * `https://admin-staging.casagrown.com`
   * `https://admin.casagrown.com`
   * `https://voice-staging.casagrown.com`
   * `https://voice.casagrown.com`
   * `https://metrics-staging.casagrown.com`
   * `https://metrics.casagrown.com`
   * `https://pro.casagrown.com`
   * `http://localhost:3000`
   * `http://localhost:3001`
   * `http://localhost:3002`
   * `http://localhost:3003`
4. **Authorized Redirect URIs**: Ensure the main Supabase redirect URI is whitelisted:
   * `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
5. Click **Save**.

---

## 3. Apple Developer Console Configurations
1. Go to **[Apple Developer Portal identifiers](https://developer.apple.com/account/resources/identifiers/list)**.
2. Filter the dropdown at top-right to **Services IDs**.
3. Select your **Sign in with Apple Service ID** configuration.
4. Click **Configure** (next to Sign in with Apple).
5. In the **Domains and Subdomains** list, add:
   * `casagrown.com`
   * `admin-staging.casagrown.com`
   * `admin.casagrown.com`
   * `voice-staging.casagrown.com`
   * `voice.casagrown.com`
   * `metrics-staging.casagrown.com`
   * `metrics.casagrown.com`
   * `pro.casagrown.com`
6. In the **Return URLs** list, ensure your Supabase redirect URI is registered:
   * `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
7. Click **Next** and then **Done** to save the changes.
