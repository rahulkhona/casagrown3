# Push Notification Setup — CasaGrown Native App

## Android (FCM — Firebase Cloud Messaging)

1. **Create Firebase project**: Go to [Firebase Console](https://console.firebase.google.com/)
   - Create project named "CasaGrown" (or use existing)
   - Enable Google Analytics if desired

2. **Add Android app**:
   - Package name: `com.casagrown.market`
   - App nickname: "CasaGrown Market"
   - Download `google-services.json`

3. **Place the file**:
   ```
   apps/expo-market/google-services.json
   ```

4. **Rebuild APK** — this is a native change, not OTA:
   ```bash
   cd apps/expo-market
   npx eas build --platform android --profile preview
   ```

## iOS (APNs — Apple Push Notification service)

> Requires Apple Developer Program membership

1. **Create APNs Key**:
   - Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
   - Certificates, Identifiers & Profiles → Keys → Create Key
   - Enable "Apple Push Notifications service (APNs)"
   - Download the `.p8` file, note the **Key ID** and **Team ID**

2. **Add iOS app in Firebase**:
   - Bundle ID: `com.casagrown.market`
   - Download `GoogleService-Info.plist`

3. **Upload APNs key to Firebase**:
   - Firebase Console → Project Settings → Cloud Messaging
   - Under "Apple app configuration", upload the `.p8` key
   - Enter Key ID and Team ID

4. **Place the file**:
   ```
   apps/expo-market/GoogleService-Info.plist
   ```

5. **Set Supabase secrets** (for server-side push via APNs):
   ```bash
   supabase secrets set APNS_KEY_ID=<your-key-id>
   supabase secrets set APNS_TEAM_ID=<your-team-id>
   supabase secrets set APNS_KEY="$(cat path/to/AuthKey_XXXX.p8)"
   supabase secrets set APNS_PRODUCTION=true
   ```

6. **Build iOS**:
   ```bash
   cd apps/expo-market
   npx eas build --platform ios --profile preview
   ```

## Verification

After setup, the push flow is:
1. User enables notifications → Expo gets a push token
2. Token is registered via `register-push-token` edge function
3. When a notification is sent, `send-push-notification` routes to:
   - `web` → Web Push (VAPID)
   - `expo` → Expo Push API (`exp.host`) → FCM/APNs
   - `ios` → Direct APNs (if configured)
   - `android` → Direct FCM (if configured)

## Files

| File | Purpose |
|------|---------|
| `google-services.json` | Android FCM config (gitignored) |
| `GoogleService-Info.plist` | iOS FCM/APNs config (gitignored) |
| `app.json` | References both files |
| `supabase/functions/send-push-notification/` | Handles all platforms |
| `supabase/functions/register-push-token/` | Stores device tokens |
