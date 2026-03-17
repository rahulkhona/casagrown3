# Market App — Web to React Native Migration Plan

> **Goal**: Port `apps/next-market` from Next.js + CSS Modules to Tamagui + Expo Router so a single codebase deploys to **web, iOS, and Android**.
>
> **Non-goal**: Migrating voice, admin, or metrics apps. Those remain web-only.

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Design Token Mapping](#2-design-token-mapping)
3. [CSS → Tamagui Translation Rules](#3-css--tamagui-translation-rules)
4. [Platform Abstraction Layer](#4-platform-abstraction-layer)
5. [Phase 0 — Foundation](#5-phase-0--foundation)
6. [Phase 1 — Shared Components](#6-phase-1--shared-components)
7. [Phase 2 — Simple Pages](#7-phase-2--simple-pages)
8. [Phase 3 — Medium Pages](#8-phase-3--medium-pages)
9. [Phase 4 — Complex Pages](#9-phase-4--complex-pages)
10. [Phase 5 — Layout, Navigation & Expo Setup](#10-phase-5--layout-navigation--expo-setup)
11. [Risk Factors & Mitigations](#11-risk-factors--mitigations)

---

## 1. Current State Audit

### Files Inventory

| Category | Count | Total Lines |
|---|---|---|
| Page routes (`app/(main)/**`) | 36 | ~11,800 |
| Reusable components (`app/components/`) | 10 | ~2,700 |
| CSS module files (`.module.css`) | 26 | ~4,800 |
| Global CSS (`globals.css`) | 1 | 370 |
| Library modules (`lib/`) | 8 | ~57,500 |
| **Total to migrate** | **~75 files** | **~19,700 lines** |

### Pages by Complexity

#### 🔴 High (> 500 lines)

| Route | Lines | CSS Module | Key Features |
|---|---|---|---|
| `/orders/[id]` | 1,128 | 247 | Order detail, QR code, receipt, status, refund, delivery photo, map |
| `/my-booth` | 1,103 | 308 | Booth dashboard, helpers, sharing, stats, calendar, passcode |
| `/earnings/payout` | 1,012 | 168 | **Stripe integration**, bank account, payout history |
| `/earnings` | 664 | 144 | Points balance, transaction history, charts |
| `/my-booth/products/new` | 654 | 273 | Product form, multi-image upload, price, share |
| `/earnings/redeem` | 616 | 167 | Gift card catalog, denomination picker, redemption flow |
| `/get-started/[template]` | 535 | 203 | Onboarding wizard, booth template, image upload |
| `BuyModal.tsx` | 509 | 233 | **Stripe card element**, purchase flow, tip, delivery options |

#### 🟡 Medium (150-500 lines)

| Route | Lines | CSS Module |
|---|---|---|
| `Navbar.tsx` | 436 | 218 |
| `/market` | 424 | 140 |
| `ProductQA.tsx` | 366 | 299 |
| `/join-booth/[code]` | 355 | 209 |
| `/profile-setup` | 333 | 120 |
| `/market/booth/[id]` | 330 | 78 |
| `/orders` | 287 | 180 |
| `MarketReceiptSheet.tsx` | 255 | 93 |
| `/market/booth/.../product/[productId]` | 243 | 67 |
| `/earnings/auto-redeem` | 241 | 82 |
| `/terms` | 240 | 95 |
| `/my-booth/products` | 230 | 160 |
| `/voice/board` | 218 | 217 |
| `RatingReminder.tsx` | 216 | — |
| `/voice/ticket` | 211 | — |
| `NotificationPromptModal.tsx` | 195 | 317 |
| `/login` | 187 | 59 |
| `/` (landing) | 181 | 228 |
| `/chat/[id]` | 180 | 62 |
| `/voice/submit` | 175 | — |
| `/helping` | 173 | 198 |
| `/my-booth/invitations` | 159 | 162 |
| `/notifications` | 151 | — |

#### 🟢 Low (< 150 lines)

| Route | Lines | CSS Module |
|---|---|---|
| `/get-started` | 144 | 121 |
| `/my-booth/coupons` | 120 | 58 |
| `/profile` | 105 | 11 |
| `FlagModal.tsx` | 104 | 81 |
| `/my-booth/orders` | 98 | — |
| `/following` | 90 | 24 |
| `NotificationBanner.tsx` | 84 | — |
| `/my-booth/customize` | 81 | — |
| `/earnings/tax-info` | 73 | 59 |
| `/settings` | 71 | — |
| `BottomNav.tsx` | 68 | 24 |
| `/chat` | 65 | — |
| `AnalyticsTracker.tsx` | 31 | — |
| `/market/booth/[id]/about` | 29 | — |
| `/my-booth/products/[id]` | 10 | — |

---

## 2. Design Token Mapping

### 2.1 Existing Tamagui Tokens (`packages/config/src/tokens.ts`)

Already defined:
- ✅ Green: `green50`–`green900`
- ✅ Gray: `gray50`–`gray900`
- ✅ Semantic: `primary`, `success`, `danger`, `info`, `warning`, `bg`, `text`, `border`
- ✅ Radius: `sm=8`, `md=12`, `lg=16`, `xl=24`, `full=9999`
- ✅ Fonts: Inter (body + heading) via `createInterFont`

### 2.2 Colors to Add to `packages/config/src/tokens.ts`

The `globals.css` and `design-tokens.ts` use these palettes not yet in Tamagui tokens:

```typescript
// Add to tokens.ts → color object:

// Emerald
emerald100: '#d1fae5',
emerald200: '#a7f3d0',
emerald300: '#6ee7b7',
emerald700: '#047857',

// Amber
amber50: '#fffbeb',
amber100: '#fef3c7',
amber200: '#fde68a',
amber300: '#fcd34d',
amber500: '#f59e0b',
amber600: '#d97706',
amber700: '#b45309',

// Sky
sky100: '#e0f2fe',
sky200: '#bae6fd',
sky300: '#7dd3fc',
sky700: '#0369a1',

// Pink
pink50: '#fdf2f8',
pink100: '#fce7f3',
pink200: '#fbcfe8',
pink300: '#f9a8d4',
pink600: '#db2777',
pink700: '#be185d',

// Blue
blue100: '#dbeafe',
blue600: '#2563eb',
blue700: '#1d4ed8',

// Purple
purple100: '#f3e8ff',
purple600: '#9333ea',
purple700: '#7c3aed',

// Red
red50: '#fef2f2',
red100: '#fee2e2',
red500: '#ef4444',
red600: '#dc2626',
red700: '#b91c1c',
```

### 2.3 Responsive Breakpoints

CSS breakpoints used → Tamagui media query mapping:

| CSS Breakpoint | Frequency | Tamagui Media |
|---|---|---|
| `max-width: 480px` | 8 files | `$xs` (phone portrait) |
| `max-width: 600px` | 1 file | `$sm` (small phone landscape) |
| `max-width: 640px` | 1 file | `$sm` |
| `max-width: 768px` | 14 files | `$md` (tablet portrait) |
| `min-width: 769px` | 3 files | `$gtMd` (desktop) |
| `max-width: 1024px` | 2 files | `$lg` (tablet landscape) |

Add to `tamagui.config.ts`:

```typescript
media: {
  xs: { maxWidth: 480 },
  sm: { maxWidth: 640 },
  md: { maxWidth: 768 },
  lg: { maxWidth: 1024 },
  xl: { maxWidth: 1280 },
  gtXs: { minWidth: 481 },
  gtSm: { minWidth: 641 },
  gtMd: { minWidth: 769 },
  gtLg: { minWidth: 1025 },
  short: { maxHeight: 820 },
  hoverNone: { hover: 'none' },
  pointerCoarse: { pointer: 'coarse' },
},
```

### 2.4 Shadow Tokens

Add CSS shadow equivalents:

```typescript
// Add to tokens.ts or theme:
shadowSm: '0 1px 2px rgba(0,0,0,0.05)',
shadow: '0 1px 3px rgba(0,0,0,0.1)',
shadowMd: '0 4px 6px rgba(0,0,0,0.07)',
shadowLg: '0 10px 15px rgba(0,0,0,0.1)',
shadowXl: '0 20px 25px rgba(0,0,0,0.1)',
```

> **Note**: On native, shadows use `shadowColor/shadowOffset/shadowRadius/elevation` — not CSS box-shadow. The `design-tokens.ts` already defines these correctly. Tamagui handles the platform difference automatically.

### 2.5 Animation Mapping

| CSS Animation | Tamagui Equivalent |
|---|---|
| `fadeIn` (opacity 0→1) | `enterStyle={{ opacity: 0 }} animation="quick"` |
| `slideUp` (translateY 20→0) | `enterStyle={{ opacity: 0, y: 20 }} animation="medium"` |
| `slideDown` (translateY -10→0) | `enterStyle={{ opacity: 0, y: -10 }} animation="quick"` |
| `scaleIn` (scale 0.95→1) | `enterStyle={{ opacity: 0, scale: 0.95 }} animation="quick"` |
| `shimmer` | Custom `Skeleton` component using `Animated` loop |
| `pulse` | `animation="pulse"` (define in animations config) |

Add to `packages/config/src/animations.ts`:

```typescript
pulse: {
  type: 'timing',
  duration: 1000,
  loop: true,
},
```

---

## 3. CSS → Tamagui Translation Rules

### 3.1 HTML Elements → Tamagui Components

| HTML | Tamagui | Notes |
|---|---|---|
| `<div>` (vertical) | `YStack` | Default flex column |
| `<div>` (horizontal / `display:flex`) | `XStack` | `flexDirection: row` |
| `<div>` (grid) | `XStack flexWrap="wrap"` | See Grid section below |
| `<span>`, `<p>`, `<h1>`–`<h6>` | `Text` | Use `fontSize`/`fontWeight` |
| `<button>` | `Button` | Use `onPress` not `onClick` |
| `<a>` | `Link` (expo-router) | Or `Text onPress={navigate}` |
| `<input type="text">` | `Input` | Same props |
| `<input type="number">` | `Input keyboardType="numeric"` | |
| `<input type="email">` | `Input keyboardType="email-address"` | |
| `<input type="password">` | `Input secureTextEntry` | |
| `<input type="file">` | Platform util → `expo-image-picker` | See §4 |
| `<input type="date">` | Platform util → `DateTimePicker` | See §4 |
| `<textarea>` | `TextArea` | |
| `<select>` | `Select` (Tamagui) | Or custom sheet on mobile |
| `<img>` | `Image` (Tamagui) | Use `source={{ uri }}` on native |
| `<dialog>` / modal divs | `Dialog` or `Sheet` | Use `Sheet` for mobile bottom-sheet UX |
| `<nav>` | `XStack` | |
| `<form>` | `YStack` | Handle submit via button `onPress` |

### 3.2 CSS Properties → Tamagui Props

| CSS | Tamagui Prop | Example |
|---|---|---|
| `className={styles.foo}` | Inline props | `<YStack padding="$4">` |
| `style={{ color: 'red' }}` | Direct props | `<Text color="$red600">` |
| `display: flex` | (default on Stack) | `<XStack>` / `<YStack>` |
| `gap: 16px` | `gap="$4"` | Token `$4` = 16px |
| `padding: 10px 20px` | `paddingVertical={10} paddingHorizontal={20}` | |
| `border: 1px solid #e5e7eb` | `borderWidth={1} borderColor="$border"` | |
| `border-radius: 12px` | `borderRadius="$md"` | Token `$md` = 12 |
| `font-size: 14px` | `fontSize={14}` or `fontSize="$3"` | |
| `font-weight: 600` | `fontWeight="600"` | |
| `color: var(--gray-600)` | `color="$gray600"` | |
| `background: var(--green-50)` | `backgroundColor="$green50"` | |
| `box-shadow: var(--shadow-md)` | `elevation={3}` (native) | Web uses CSS shadow via theme |
| `cursor: pointer` | `cursor="pointer"` | Web-only, ignored on native |
| `text-align: center` | `textAlign="center"` | |
| `overflow: hidden` | `overflow="hidden"` | |
| `position: fixed` | Not available on native | Use `position="absolute"` + safe areas |
| `max-width: 640px` | `maxWidth={640}` | |
| `min-height: 100vh` | `minHeight="100%"` | Plus safe area insets |
| `transition: all 0.2s` | `animation="quick"` | Tamagui handles transitions |
| `:hover` | `hoverStyle={{ ... }}` | Auto-ignored on mobile |
| `:focus` | `focusStyle={{ ... }}` | |
| `::placeholder` | `placeholderTextColor` | On Input/TextArea |

### 3.3 CSS Grid → Tamagui

CSS Grid doesn't exist on React Native. Replace with:

```tsx
// CSS: .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
// Tamagui:
<XStack flexWrap="wrap" gap="$4">
  {items.map(item => (
    <YStack key={item.id} width="31%" $md={{ width: "48%" }} $xs={{ width: "100%" }}>
      {/* card content */}
    </YStack>
  ))}
</XStack>
```

### 3.4 globals.css Utility → Tamagui Component Map

Each utility class in `globals.css` needs a Tamagui equivalent. Create these as shared styled components in `packages/app/ui/`:

| CSS Utility Class | Tamagui Component / Pattern |
|---|---|
| `.btn`, `.btn-primary`, `.btn-secondary`, etc. | `<Button theme="green">`, `<Button variant="outlined">` |
| `.btn-lg`, `.btn-sm`, `.btn-xs` | `<Button size="$5">`, `<Button size="$3">`, `<Button size="$2">` |
| `.card`, `.card-glass` | `<Card bordered>`, `<Card backgroundColor="rgba(255,255,255,0.8)">` |
| `.input`, `.input-error` | `<Input>`, `<Input theme="red">` |
| `.textarea` | `<TextArea>` |
| `.badge`, `.badge-green`, etc. | Create `<Badge color="green">` component |
| `.tabs`, `.tab`, `.tab-active` | `<Tabs>` (Tamagui) |
| `.modal-overlay`, `.modal` | `<Dialog>` or `<Sheet>` |
| `.toast-success`, `.toast-error` | `<Toast>` (Tamagui) |
| `.avatar`, `.avatar-sm`, `.avatar-lg` | Create `<Avatar size="sm">` component |
| `.empty-state` | Create `<EmptyState icon={} title="" text="">` component |
| `.skeleton` | Create `<Skeleton>` with animated gradient |
| `.switch` | `<Switch>` (Tamagui) |
| `.progress-bar` | `<Progress>` (Tamagui) |
| `.divider` | `<Separator>` (Tamagui) |
| `.container`, `.container-sm` | `<YStack maxWidth={1200} marginHorizontal="auto" paddingHorizontal="$5">` |

---

## 4. Platform Abstraction Layer

Create `packages/app/utils/platform.ts` with cross-platform utilities:

```typescript
// packages/app/utils/platform.ts
import { Platform } from 'react-native'

// ─── Sharing ───
export async function shareText(text: string, title?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (navigator.share) {
      await navigator.share({ title, text })
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  }
  // Native: use expo-sharing
  const { shareAsync } = await import('expo-sharing')
  await shareAsync(text)  // simplified — adapt as needed
  return true
}

// ─── Clipboard ───
export async function copyToClipboard(text: string): Promise<void> {
  if (Platform.OS === 'web') {
    await navigator.clipboard.writeText(text)
    return
  }
  const Clipboard = await import('expo-clipboard')
  await Clipboard.setStringAsync(text)
}

// ─── URL / Origin ───
export function getOriginUrl(): string {
  if (Platform.OS === 'web') {
    return window.location.origin
  }
  return 'https://casagrown.com'  // configure via env/constants
}

// ─── Open External URL ───
export async function openUrl(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(url, '_blank')
    return
  }
  const { Linking } = await import('react-native')
  await Linking.openURL(url)
}

// ─── Image Picker (replaces <input type="file">) ───
export async function pickImage(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) resolve(URL.createObjectURL(file))
        else resolve(null)
      }
      input.click()
    })
  }
  const ImagePicker = await import('expo-image-picker')
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  })
  return result.canceled ? null : result.assets[0].uri
}

// ─── Date Picker (replaces <input type="date">) ───
// Web: use native <input type="date"> via Platform.select
// Native: use @react-native-community/datetimepicker
// Wrap in a component: packages/app/ui/DatePicker.tsx
```

### Web-Specific APIs — Complete Reference

| API | Files Using It | Migration |
|---|---|---|
| `useRouter()` | 8 pages | → `useRouter()` from `expo-router` (API-compatible) |
| `usePathname()` | 4 files | → `usePathname()` from `expo-router` (API-compatible) |
| `useSearchParams()` | 1 file | → `useSearchParams()` from `expo-router` |
| `navigator.share()` | `products/new`, `products`, `coupons`, `my-booth` | → `platform.shareText()` |
| `navigator.clipboard.writeText()` | `products/new`, `products`, `coupons`, `my-booth` | → `platform.copyToClipboard()` |
| `window.location.origin` | `products/new`, `products`, `coupons`, `my-booth` | → `platform.getOriginUrl()` |
| `document.addEventListener('mousedown')` | `Navbar.tsx` (click-outside) | → `Pressable` with `onPressOut` / `Sheet` on mobile |
| `document.getElementById()` | `BuyModal.tsx` (Stripe) | → Platform-specific Stripe component |
| `dangerouslySetInnerHTML` | `layout.tsx` (SW reg) | → Remove; use `expo-notifications` on native |
| `<input type="file">` | `products/new`, `get-started` | → `platform.pickImage()` |
| `<input type="date">` | `earnings/*` pages | → `DatePicker` component |
| Leaflet/MapContainer | `market/page.tsx` | → `react-native-maps` `MapView` |
| Stripe Elements (DOM) | `BuyModal.tsx`, `earnings/payout` | → `@stripe/stripe-react-native` — **platform split** |
| Service Worker | `layout.tsx` | → Skip on native; `expo-notifications` for push |
| CSS `position: fixed` | `Navbar.tsx`, `BottomNav.tsx`, toast/modal | → `position: absolute` + SafeAreaView insets |

---

## 5. Phase 0 — Foundation

**Duration: 2-3 days**

### Step 0.1: Update Tamagui token config

File: `packages/config/src/tokens.ts`

Add all missing color palettes (amber, sky, pink, blue, purple, red, emerald) as documented in §2.2.

### Step 0.2: Add media queries to Tamagui config

File: `packages/config/src/tamagui.config.ts`

Add the `media` config as documented in §2.3.

### Step 0.3: Create platform abstraction utilities

File: `packages/app/utils/platform.ts`

Implement all 5 functions documented in §4.

### Step 0.4: Create shared UI primitives

Directory: `packages/app/ui/`

Create cross-platform equivalents for globals.css utility classes:

| File | Replaces |
|---|---|
| `Badge.tsx` | `.badge`, `.badge-green`, `.badge-red`, etc. |
| `Avatar.tsx` | `.avatar`, `.avatar-sm`, `.avatar-lg`, `.avatar-xl` |
| `EmptyState.tsx` | `.empty-state`, `.empty-state-icon`, `.empty-state-title` |
| `Skeleton.tsx` | `.skeleton` animation |
| `Container.tsx` | `.container`, `.container-sm`, `.container-md` |
| `PageHeader.tsx` | `.page-header`, `.page-title`, `.page-subtitle` |
| `Price.tsx` | `.price`, `.price-large`, `.price-strikethrough` |
| `FormGroup.tsx` | `.form-group`, `.form-row`, `.form-helper`, `.form-error` |
| `DatePicker.tsx` | `<input type="date">` with platform logic |

### Step 0.5: Create Expo app scaffold

```bash
npx create-expo-app apps/expo-market --template tabs
```

Configure:
- `app.json` — name, scheme (deep links), plugins
- `expo-router` for file-based routing matching Next.js routes
- Share `packages/app/` and `packages/config/` via metro config

### Step 0.6: Routing map

| Next.js Route | Expo Router File |
|---|---|
| `app/(main)/page.tsx` | `app/(tabs)/index.tsx` |
| `app/(main)/market/page.tsx` | `app/(tabs)/market/index.tsx` |
| `app/(main)/orders/page.tsx` | `app/(tabs)/orders/index.tsx` |
| `app/(main)/orders/[id]/page.tsx` | `app/(tabs)/orders/[id].tsx` |
| `app/(main)/my-booth/page.tsx` | `app/(tabs)/my-booth/index.tsx` |
| `app/(main)/earnings/page.tsx` | `app/(tabs)/earnings/index.tsx` |
| ... | (all routes follow same pattern) |

---

## 6. Phase 1 — Shared Components

**Duration: 3-4 days** | **10 components** | **~2,700 lines TSX + ~1,265 lines CSS**

### Migration order (dependencies first):

#### 1. `AnalyticsTracker.tsx` (31 lines, no CSS)
- **Change**: `usePathname` from `next/navigation` → `expo-router`
- **Platform**: Shared (no web-specific APIs beyond pathname)

#### 2. `NotificationBanner.tsx` (84 lines, no CSS module)
- **Change**: `<div>` → `YStack`/`XStack`, inline styles → Tamagui props
- **Platform**: Fully shared

#### 3. `BottomNav.tsx` (68 lines, 24 lines CSS)
- **Change**: `<nav>` → `XStack`, `usePathname` → `expo-router`, CSS responsive hide → `$gtMd={{ display: 'none' }}`
- **Delete**: `BottomNav.module.css`
- **Platform**: Shared, but on native may integrate with Expo Router tab navigator

#### 4. `FlagModal.tsx` (104 lines, 81 lines CSS)
- **Change**: `<div>` modal → `Dialog`, `<textarea>` → `TextArea`, `<button>` → `Button`
- **Delete**: `FlagModal.module.css`
- **Platform**: Fully shared

#### 5. `RatingReminder.tsx` (216 lines, no CSS module)
- **Change**: `<div>` → `Card`/`YStack`, `<button>` → `Button`, star icons
- **Platform**: Fully shared

#### 6. `Navbar.tsx` (436 lines, 218 lines CSS) ⚠️ Complex
- **Change**: `<header>` → `XStack`, `<nav>` → `XStack`, dropdown menus → `Popover`
- **Platform split**:
  - **Web**: Keep click-outside via `Popover` (Tamagui handles it)
  - **Native**: Replace dropdown with `Sheet` or stack navigation
- `usePathname` / `useRouter` → `expo-router`
- `document.addEventListener('mousedown')` → Remove (use Tamagui `Popover`)
- **Delete**: `Navbar.module.css`

#### 7. `MarketReceiptSheet.tsx` (255 lines, 93 lines CSS)
- **Change**: `<div>` modal → `Sheet` (bottom sheet on mobile), QR code display
- **Delete**: `MarketReceiptSheet.module.css`
- **Platform**: Mostly shared; QR rendering works cross-platform

#### 8. `ProductQA.tsx` (366 lines, 299 lines CSS)
- **Change**: `<div>` → `YStack`/`XStack`, `<input>` → `Input`, `<button>` → `Button`
- **Delete**: `ProductQA.module.css`
- **Platform**: Fully shared

#### 9. `NotificationPromptModal.tsx` (195 lines, 317 lines CSS)
- **Change**: `<div>` → `Dialog`, permission flow
- **Platform split**:
  - **Web**: Web Push API
  - **Native**: `expo-notifications` + `expo-device`
- **Delete**: `NotificationPrompt.module.css`

#### 10. `BuyModal.tsx` (509 lines, 233 lines CSS) ⚠️ Complex
- **Change**: `<div>` → `Dialog` or `Sheet`, form inputs → `Input`
- **Platform split** (Stripe):
  - **Web**: `@stripe/react-stripe-js` + Stripe Elements (current)
  - **Native**: `@stripe/stripe-react-native` + `CardField`
- Create: `packages/app/ui/StripeCardInput.tsx` with platform-specific implementations
- **Delete**: `BuyModal.module.css`

---

## 7. Phase 2 — Simple Pages

**Duration: 3-4 days** | **10 pages** | **~1,566 lines TSX + ~492 lines CSS**

Each page follows the same pattern:
1. Replace `<div className={styles.x}>` → `<YStack {...tamaguiProps}>`
2. Replace `<p>`, `<h1>`, `<span>` → `<Text>` with size/weight props
3. Replace `<button className="btn btn-primary">` → `<Button theme="green">`
4. Replace `<input className="input">` → `<Input>`
5. Delete the `.module.css` file
6. Replace `useRouter` import from `next/navigation` → `expo-router`

| # | Page | Lines | Delete CSS | Special Handling |
|---|---|---|---|---|
| 1 | `/settings` | 71 | — | None |
| 2 | `/profile` | 105 | 11 lines | Avatar component |
| 3 | `/following` | 90 | 24 lines | Booth list |
| 4 | `/chat` (list) | 65 | — | Conversation list |
| 5 | `/chat/[id]` | 180 | 62 lines | Message bubbles, input |
| 6 | `/notifications` | 151 | — | Notification list |
| 7 | `/login` | 187 | 59 lines | OTP input |
| 8 | `/terms` | 240 | 95 lines | Static text |
| 9 | `/get-started` | 144 | 121 lines | Template grid |
| 10 | `/profile-setup` | 333 | 120 lines | Multi-step form, image upload → `pickImage()` |

---

## 8. Phase 3 — Medium Pages

**Duration: 4-5 days** | **13 pages** | **~3,100 lines TSX + ~1,470 lines CSS**

| # | Page | Lines | Delete CSS | Special Handling |
|---|---|---|---|---|
| 1 | `/market/booth/[id]/about` | 29 | — | None |
| 2 | `/my-booth/customize` | 81 | — | Color/style pickers |
| 3 | `/my-booth/orders` | 98 | — | Order list |
| 4 | `/my-booth/coupons` | 120 | 58 lines | Share via `platform.shareText()`, `platform.copyToClipboard()` |
| 5 | `/my-booth/invitations` | 159 | 162 lines | Invitation cards, accept/reject |
| 6 | `/helping` | 173 | 198 lines | Helper dashboard |
| 7 | `/my-booth/products` | 230 | 160 lines | Product list, share actions → `platform.*` |
| 8 | `/market/booth/[id]/product/[productId]` | 243 | 67 lines | Product detail, buy button |
| 9 | `/earnings/auto-redeem` | 241 | 82 lines | Preference toggles |
| 10 | `/orders` | 287 | 180 lines | Order list, status filters, tabs |
| 11 | `/market/booth/[id]` | 330 | 78 lines | Booth detail, product grid → flexWrap |
| 12 | `/join-booth/[code]` | 355 | 209 lines | Accept/reject flow |
| 13 | `/market` | 424 | 140 lines | **Leaflet → `react-native-maps`** (see §11) |

### Market page map migration detail:

```tsx
// Web (current): Leaflet
import { MapContainer, TileLayer, Marker } from 'react-leaflet'

// Cross-platform:
import { Platform } from 'react-native'

const MapComponent = Platform.select({
  web: () => require('./MapWeb').default,      // Keep Leaflet on web
  default: () => require('./MapNative').default, // react-native-maps on native
})!
```

Create:
- `packages/app/ui/MapWeb.tsx` — Leaflet wrapper (web only)
- `packages/app/ui/MapNative.tsx` — `react-native-maps` wrapper (native only)

---

## 9. Phase 4 — Complex Pages

**Duration: 5-7 days** | **10 pages** | **~6,200 lines TSX + ~1,880 lines CSS**

| # | Page | Lines | Delete CSS | Special Handling |
|---|---|---|---|---|
| 1 | `/earnings/tax-info` | 73 | 59 lines | Form |
| 2 | `/` (landing) | 181 | 228 lines | Hero section, Feature cards, How-it-works |
| 3 | `/get-started/[template]` | 535 | 203 lines | Wizard, image upload → `pickImage()` |
| 4 | `/earnings` | 664 | 144 lines | Balance dashboard, charts, history |
| 5 | `/earnings/redeem` | 616 | 167 lines | Gift card grid, denomination picker |
| 6 | `/my-booth/products/new` | 654 | 273 lines | Product form, multi-image, share → `platform.*` |
| 7 | `/earnings/payout` | 1,012 | 168 lines | **Stripe** — platform split (see below) |
| 8 | `/my-booth` | 1,103 | 308 lines | Booth management, helpers, share → `platform.*` |
| 9 | `/orders/[id]` | 1,128 | 247 lines | Order detail, QR, map, receipt, delivery photo |
| 10 | Voice routes (3) | ~604 | 217 lines | Can reuse `next-community-voice` components |

### Stripe payout page platform split:

```
apps/next-market/app/(main)/earnings/payout/
├── page.tsx                    # Shared business logic + layout
├── StripeConnectWeb.tsx        # Web: Stripe Connect onboarding (iframe/redirect)
└── StripeConnectNative.tsx     # Native: Stripe Connect via WebView or deep link
```

---

## 10. Phase 5 — Layout, Navigation & Expo Setup

**Duration: 2-3 days**

### 10.1 Root Layout

Replace `app/layout.tsx`:
- Remove `<html>`, `<body>`, `dangerouslySetInnerHTML` (web-only)
- Add `TamaguiProvider`, `SafeAreaProvider`
- Move font loading to Expo's `useFonts`

### 10.2 Main Layout

Replace `app/(main)/layout.tsx`:
- `<div className="page-wrapper">` → `<YStack flex={1}>`
- Navbar → component (already migrated in Phase 1)
- BottomNav → Expo Router tab bar

### 10.3 Delete files

After all phases complete:
- Delete `app/globals.css`
- Delete all 26 `.module.css` files
- Delete `next.config.js` Leaflet-specific configs

### 10.4 Deep Linking

Configure in `app.json`:

```json
{
  "scheme": "casagrown",
  "web": { "bundler": "metro" },
  "plugins": [
    ["expo-router", { "origin": "https://casagrown.com" }]
  ]
}
```

### 10.5 Navigation structure

```
app/
├── _layout.tsx          # Root: TamaguiProvider + SafeArea
├── (auth)/
│   ├── login.tsx
│   └── profile-setup.tsx
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator (Market, Orders, My Booth, Earnings, More)
│   ├── index.tsx         # Landing / Home
│   ├── market/
│   │   ├── index.tsx
│   │   └── booth/[id]/
│   ├── orders/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   ├── my-booth/
│   │   ├── index.tsx
│   │   ├── products/
│   │   └── ...
│   └── earnings/
│       ├── index.tsx
│       ├── payout.tsx
│       └── redeem.tsx
├── join-booth/[code].tsx
└── +not-found.tsx
```

---

## 11. Risk Factors & Mitigations

### 🔴 High Risk

| Risk | Impact | Mitigation |
|---|---|---|
| **Stripe Web → Native** | `BuyModal` + `earnings/payout` break | Platform-specific Stripe components behind shared interface. Test both flows separately. |
| **Leaflet → react-native-maps** | Market page map completely different API | Create `MapWeb`/`MapNative` abstraction. Can defer native map to after initial launch. |
| **CSS Grid layouts** | 4 grid utilities, ~8 pages use them | Replace with `XStack flexWrap` + percentage widths. Test responsive behavior. |

### 🟡 Medium Risk

| Risk | Impact | Mitigation |
|---|---|---|
| **`position: fixed`** (Navbar, BottomNav, modals, toasts) | Not supported on RN | Use `position: absolute` + SafeAreaView. Tamagui `Sheet`/`Dialog` handle this. |
| **CSS animations** | 6 keyframe animations used globally | Tamagui `animation` prop covers enter/exit. Custom `Animated` for shimmer/pulse. |
| **Image uploads** | `<input type="file">` doesn't exist on RN | `platform.pickImage()` wraps `expo-image-picker`. Already defined in §4. |
| **Scrollbar styling** | `::-webkit-scrollbar` CSS | No-op on native (native scrollbars are standard). Remove from migrated code. |

### 🟢 Low Risk

| Risk | Impact | Mitigation |
|---|---|---|
| **`useRouter`/`usePathname`** | Import path change | Expo Router provides same API — just change import |
| **`navigator.share/clipboard`** | 5 files | `platform.ts` abstractions handle it |
| **Google Fonts** | `@import url(...)` in CSS | Expo's `useFonts` + `expo-font` — Inter already in Tamagui config |
| **Service Worker** | `layout.tsx` | Remove for native; use `expo-notifications` for push |

---

## Effort Summary

| Phase | What | Files | Lines | Days |
|---|---|---|---|---|
| **0** | Foundation: tokens, platform utils, UI primitives, Expo scaffold | ~15 new | ~800 | 2-3 |
| **1** | Shared components | 10 + 10 CSS (deleted) | ~3,500 | 3-4 |
| **2** | Simple pages | 10 + 7 CSS (deleted) | ~2,000 | 3-4 |
| **3** | Medium pages | 13 + 10 CSS (deleted) | ~4,600 | 4-5 |
| **4** | Complex pages | 10 + 10 CSS (deleted) | ~8,100 | 5-7 |
| **5** | Layout, nav, cleanup | ~5 | ~400 | 2-3 |
| **Total** | | **~63 modified + 26 CSS deleted + ~15 new** | **~19,400** | **19-26 days** |

---

## Testing Strategy

After each phase:

1. **Unit tests**: Run `npx vitest run` in `apps/next-market` — all 446 tests must pass
2. **Playwright E2E**: Run existing Playwright suite — verify web still works
3. **Visual check**: Verify no layout regressions on web
4. **Native check** (Phase 0+): Run `npx expo start` and verify on iOS Simulator + Android Emulator

After Phase 5 (completion):

5. **Full E2E on native**: Manual testing of all flows on both platforms
6. **Accessibility**: Verify Tamagui accessibility props (`accessibilityRole`, `accessibilityLabel`) are set
7. **Performance**: Compare web bundle size before/after, measure native startup time
