# Physical Device Testing Guide

This guide covers everything needed to test CasaGrown on real physical devices
and via cloud device farm services.

## 1. Push Notification Keys

### Web Push (VAPID) — ✅ Already Configured

VAPID keys are set in `supabase/.env.local`, `supabase/functions/.env`, and
`apps/next-community/.env.local`. Web Push works on all modern browsers (Chrome,
Safari, Firefox) on desktop and mobile.

### iOS (APNs) — Setup Needed

**Requirements**: Apple Developer Account ($99/year)

**Steps**:

1. Go to [developer.apple.com](https://developer.apple.com) → Certificates,
   Identifiers & Profiles → Keys → **Create a Key**
2. Name it (e.g., "CasaGrown Push"), enable **Apple Push Notifications service
   (APNs)**
3. Click Continue → Register → **Download the `.p8` file** (one-time download)
4. Note the **Key ID** from the confirmation page
5. Find your **Team ID** in Account → Membership (top right of portal)
6. Set secrets:
   ```bash
   supabase secrets set \
     APNS_KEY_ID="<key-id>" \
     APNS_TEAM_ID="<team-id>" \
     APNS_KEY="$(cat AuthKey_<key-id>.p8)"
   ```

### Android (FCM) — Setup Needed

**Requirements**: Google account (free)

**Steps**:

1. Go to [console.firebase.google.com](https://console.firebase.google.com) →
   Create project
2. Add Android app with package name `dev.casagrown.community`
3. Download `google-services.json` → place in `apps/expo-community/`
4. Project Settings → Cloud Messaging → copy **Server Key**
5. Set secret:
   ```bash
   supabase secrets set FCM_SERVER_KEY="<server-key>"
   ```

> [!NOTE]
> Google is migrating to **FCM v1 (HTTP v2 API)** with service account JSON. Our
> code uses the legacy API — it works but should be migrated before Google
> deprecates legacy keys.

## 2. Test Distribution (Pre-Launch Beta)

### iOS — TestFlight

| Detail          | Value                                                               |
| :-------------- | :------------------------------------------------------------------ |
| **Max testers** | 10,000 (email invite or public link)                                |
| **Review**      | First build needs Apple review (~24h), subsequent builds are faster |
| **Install**     | Testers install via TestFlight app                                  |
| **Cost**        | Free (needs $99/yr developer account)                               |

```bash
# Build and submit to TestFlight with Expo
eas build --platform ios --profile preview
eas submit --platform ios
```

### Android — Google Play Testing Tracks

| Track        | Max Testers | Review | Use Case     |
| :----------- | ----------: | :----- | :----------- |
| **Internal** |         100 | None   | Team testing |
| **Closed**   |   Unlimited | ~hours | Beta testers |
| **Open**     |   Unlimited | ~hours | Public beta  |

```bash
# Build and submit to Play Store internal track
eas build --platform android --profile preview
eas submit --platform android
```

## 3. Recommended Physical Devices

### Minimum Set (3 devices)

| Device               | Why                                       | Budget         |
| :------------------- | :---------------------------------------- | :------------- |
| **iPhone** (iOS 16+) | Camera, APNs push, Safari PWA, TestFlight | ~$150–200 used |
| **Android** (mid)    | Camera, FCM push, screen diversity        | ~$150–200      |
| **Your Mac**         | Browser testing, simulators, Xcode builds | Already have   |

### What Requires Physical Devices

| Feature               |  Emulator  | Physical |
| :-------------------- | :--------: | :------: |
| Camera / photo upload |     ❌     |    ✅    |
| Push (APNs)           |     ❌     |    ✅    |
| Push (FCM)            |     ⚠️     |    ✅    |
| GPS / real location   |  ⚠️ fake   |    ✅    |
| Performance / jank    | misleading |    ✅    |
| Keyboard behavior     |     ⚠️     |    ✅    |
| Deep links            |     ⚠️     |    ✅    |
| App Store install     |     ❌     |    ✅    |

## 4. Cloud Device Farm Services

These services let you test on real devices via a browser — no purchases needed.

| Service                                                   | Free Tier                         | Manual Testing | Maestro Support |
| :-------------------------------------------------------- | :-------------------------------- | :------------: | :-------------: |
| [Firebase Test Lab](https://firebase.google.com/test-lab) | 10 physical + 5 virtual tests/day | ❌ (auto only) |       ❌        |
| [AWS Device Farm](https://aws.amazon.com/device-farm/)    | 1,000 minutes free (12 months)    |       ✅       |       ✅        |
| [BrowserStack](https://www.browserstack.com)              | 30 min trial                      |       ✅       |       ✅        |
| [Sauce Labs](https://saucelabs.com)                       | Free trial                        |       ✅       |   via Appium    |

### Firebase Test Lab (Recommended — Free)

Best for automated smoke testing on Android. Upload APK, it auto-crawls the app
and reports crashes (Robo Test). No scripts needed.

```bash
# Build APK
eas build --platform android --profile preview --local

# Upload to Firebase Test Lab
gcloud firebase test android run \
  --type robo \
  --app ./build/app-release.apk \
  --device model=Pixel6,version=33
```

### AWS Device Farm (Recommended — Free Tier)

Best for manual testing on both iOS and Android. Remote Access sessions give
full touch control of a real device via browser.

### BrowserStack (Paid)

Best for running Maestro flows on real devices:

```bash
browserstack-cli app-automate maestro \
  --app ./app-release.apk \
  --test-suite ./e2e/maestro/flows/
```

## 5. Maestro Flows for Physical Devices

Device-only flows live in `e2e/maestro/flows-device-only/`, separate from the 24
emulator-safe flows in `e2e/maestro/flows/`.

```bash
# Run emulator-safe flows only (local development on emulator)
maestro test e2e/maestro/flows/

# Run device-only flows (on connected physical device or cloud device farm)
maestro test e2e/maestro/flows-device-only/

# Run ALL flows on a real device (full coverage: emulator + device-only)
maestro test e2e/maestro/flows/ e2e/maestro/flows-device-only/
```

### Cloud Device Farm CI Example

When testing via a service like BrowserStack, Maestro Cloud, or AWS Device Farm,
you have access to real hardware. Run **both** directories for full 25/25
coverage:

```bash
# BrowserStack example
browserstack-cli app-automate maestro \
  --app ./app-release.apk \
  --test-suite ./e2e/maestro/flows/ ./e2e/maestro/flows-device-only/

# Maestro Cloud example
maestro cloud --app-file ./app-release.apk \
  e2e/maestro/flows/ e2e/maestro/flows-device-only/
```

### Flow Summary (25 total)

| Directory            | Flows | Runs On                           |
| :------------------- | ----: | :-------------------------------- |
| `flows/`             |    24 | Emulator + physical device        |
| `flows-device-only/` |     1 | Physical device / cloud farm only |

## 6. Pre-Launch Checklist

- [ ] Apple Developer Account ($99/yr) → enables TestFlight + APNs
- [ ] Google Play Developer Account ($25 one-time) → enables Play testing + FCM
- [ ] Generate APNs key → set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`
- [ ] Create Firebase project → set `FCM_SERVER_KEY`, download
      `google-services.json`
- [ ] Configure `eas.json` with `preview` profile
- [ ] First TestFlight build → invite testers
- [ ] First Play Store internal build → invite testers
- [ ] Run `camera-upload.yaml` on physical device to verify photo flow
- [ ] Test push notifications end-to-end on both platforms
