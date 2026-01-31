# CasaGrown Design System

This document serves as the official specification for the CasaGrown visual identity and UI components, based on the "Modern Community Market" Figma prototype.

## Design Philosophy
- **Approachable & Fresh**: Earthy greens and generous whitespace to create a welcoming community feel.
- **Modern & Bubbly**: Large border radii (16-32px) and pill-shaped interactive elements for a tactile, friendly experience.
- **Action-Oriented**: High-contrast status indicators to guide users through marketplace transactions.

---

## 1. Visual Tokens

### Colors
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `primary` | `#16a34a` | CTAs, branding, active states. |
| `primaryHover` | `#15803d` | Button hover states. |
| `success` | `#22c55e` | Success alerts, positive badges (e.g., "Delivered"). |
| `danger` | `#ef4444` | Destructive actions (Dispute, Cancel). |
| `info` | `#3b82f6` | Tips, informational banners, blue "Chat" buttons. |
| `warning` | `#f59e0b` | Pending status, urgent alerts. |
| `bg` | `#f9fafb` | Main application background (off-white). |
| `card` | `#ffffff` | Component backgrounds (Cards, Modals). |
| `text` | `#111827` | Headings and high-contrast text. |
| `textMuted` | `#4b5563` | Body text and metadata descriptions. |

### Border Radius
- `true`: **12px** (Standard buttons, inputs, small cards)
- `lg`: **24px** (Product cards, list items)
- `xl`: **32px** (Large onboarding containers, hero sections)
- `full`: **9999px** (Pill buttons, notification badges, avatars)

### Typography
- **Headings**: Sans-serif, Extra Bold (700-800).
- **Body**: Sans-serif, Regular/Medium (400-500).
- **Scale**: 16px base with standard scaling for H1-H4.

---

## 2. Core Components

### Form Elements
- **Input**: Rounded (12px), light gray border, support for leading/trailing icons.
- **TextArea**: Multi-line support with optional integrated character counter (0/500).
- **Pill/Tag**: Small capsules used for categorizing produce (e.g., "Tomatoes", "Basil").
- **CheckboxCard**: Selectable card with title and description, used in preference settings.
- **Dropzone**: Dashed border area for "Upload Photo/Video" functionality.

### Feedback & Navigation
- **HeaderNav**: Horizontal bar containing search, points balance, and unread badges for Chats/Orders.
- **ProgressBar**: Thin green bar indicating progress through multi-step flows.
- **AlertBanner**: Contextual notification bar with color-coded backgrounds (Primary/Info/Warning/Danger).
- **StatusBadge**: High-contrast indicator for order states (e.g., "Buying", "Selling", "Pickup").

---

## 3. Layout Patterns

### Onboarding Flow
- Centered cards with `xl` (32px) radius.
- Consistent "Back" and "Continue" button placement at the bottom.
- Progress bar pinned to the top of the viewport.

### Marketplace Feed
- Standardized `lg` (24px) radius for post cards.
- Vertical stack of information: User Header -> Visual Asset -> Title/Price -> Action Buttons.
- Use of `bg` (#f9fafb) for the page background to make white cards pop.
