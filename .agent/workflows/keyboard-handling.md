---
description: How to handle keyboard behavior on mobile form screens
---

# Keyboard Handling for Mobile Forms

When creating any screen with text inputs (forms, search, login, etc.), always
apply these props to the `ScrollView` wrapping the form content:

```tsx
<ScrollView
    automaticallyAdjustKeyboardInsets
    keyboardShouldPersistTaps="handled"
    // ...other props
>
    {/* form content with inputs */}
</ScrollView>;
```

## Rules

1. **DO NOT** use `KeyboardAvoidingView` — it only adds padding but doesn't
   auto-scroll to the focused input.
2. **DO** use `automaticallyAdjustKeyboardInsets` on `ScrollView` — this is a
   built-in React Native 0.73+ prop that both adjusts for the keyboard AND
   auto-scrolls to the focused input.
3. **DO** add `keyboardShouldPersistTaps="handled"` to prevent taps on
   buttons/links from being swallowed while the keyboard is open.
4. **Android** handles keyboard avoidance natively via `adjustResize`, so
   `automaticallyAdjustKeyboardInsets` is effectively iOS-only — but it's safe
   to include on all platforms.
5. **Web** doesn't need keyboard handling — browsers handle it natively.

## Reference Implementation

See `packages/app/features/create-post/sell-form.tsx` for a working example.
