# Community Voice — Design Document

**App**: `apps/next-community-voice/` (Next.js, port 3002)\
**Last Updated**: March 12, 2026\
**Status**: ✅ Fully implemented with Playwright E2E + Vitest unit tests

---

## 1. Overview

Community Voice is a public-facing feedback platform where CasaGrown users can
submit bug reports and feature requests, browse/vote on community feedback, and
staff can triage and manage submissions. It runs on port 3002 as a standalone
Next.js application.

### Architecture

```
apps/next-community-voice/
├── app/
│   ├── layout.tsx              # Root layout with shared providers
│   ├── auth-guard.tsx          # Auth gate for staff routes
│   ├── page.tsx                # Landing page (Submit / Browse buttons)
│   ├── login/page.tsx          # Staff login
│   ├── submit/page.tsx         # Feedback submission form
│   ├── board/                  # Public feedback board
│   │   ├── page.tsx            # Board listing
│   │   └── [id]/page.tsx       # Ticket detail view
│   └── staff/                  # Staff-only routes
│       ├── dashboard/          # Staff dashboard
│       ├── manage/             # Feedback management
│       ├── profile/            # Staff profile
│       └── reports/            # Feedback reports/analytics
├── features/
│   └── feedback/
│       ├── feedback-board.tsx       # Board component (35KB)
│       ├── feedback-detail.tsx      # Ticket detail (20KB)
│       ├── feedback-submit-form.tsx # Submission form (13KB)
│       ├── feedback-service.ts      # Data access layer (32KB)
│       ├── feedback-service.test.ts # Service unit tests (22KB)
│       ├── staff-dashboard.tsx      # Staff dashboard
│       ├── staff-manage.tsx         # Staff management
│       ├── staff-profile.tsx        # Staff profile
│       └── staff-reports.tsx        # Reports/analytics
└── e2e/
    ├── board.spec.ts           # Board browsing tests
    ├── submit.spec.ts          # Submit form tests
    ├── ticket-detail.spec.ts   # Ticket detail tests
    └── flagging.spec.ts        # Content flagging tests
```

---

## 2. User Flows

### 2.1 Public Users

| Flow | Route | Description |
| :--- | :---- | :---------- |
| **Landing** | `/` | CTA buttons: "Submit Feedback" and "Browse Board" |
| **Submit** | `/submit` | Form with type selector (`feature_request`/`bug_report`), title, description, media upload. Requires auth (redirects to `/login` if not signed in). |
| **Browse Board** | `/board` | Public feed of all submitted feedback with voting, filtering by type/status, and search. No auth required. |
| **Ticket Detail** | `/board/[id]` | Full ticket view with comments, status badge, vote count, and discussion thread. |

### 2.2 Staff Users

| Flow | Route | Description |
| :--- | :---- | :---------- |
| **Staff Login** | `/login` | Staff-only authentication |
| **Dashboard** | `/staff/dashboard` | Overview metrics (open tickets, trending, recent activity) |
| **Manage** | `/staff/manage` | Triage feedback: change status, assign priority, merge duplicates |
| **Reports** | `/staff/reports` | Analytics and reporting on feedback trends |
| **Profile** | `/staff/profile` | Staff profile settings |

---

## 3. Database Model

### `feedback` table

| Column | Type | Description |
| :----- | :--- | :---------- |
| `id` | `uuid` | Primary Key |
| `user_id` | `uuid` | FK to `profiles(id)`. Submitter. |
| `type` | `feedback_type` | `feature_request` or `bug_report` |
| `status` | `feedback_status` | Lifecycle status (see below) |
| `title` | `text` | Feedback title |
| `description` | `text` | Detailed description |
| `vote_count` | `integer` | Aggregated upvotes |
| `is_flagged` | `boolean` | Whether content has been flagged |
| `created_at` | `timestamptz` | Submission timestamp |

### Feedback Status Lifecycle

```
open → under_review → planned → in_progress → completed
                   → rejected
                   → duplicate
```

### Related Tables

- `feedback_votes` — User vote tracking (one vote per user per ticket)
- `feedback_comments` — Discussion thread on each ticket
- `feedback_media` — Attached images/videos (Supabase Storage)
- `feedback_flags` — Content flagging records

---

## 4. Key Features

### 4.1 Voting

- One upvote per authenticated user per ticket
- Vote count aggregated and displayed on board cards
- Vote status persisted across sessions

### 4.2 Search & Filtering

- Full-text search by title and description (server-side)
- Filter by type: All, Feature Requests, Bug Reports
- Filter by status: All, Open, Planned, In Progress, Completed
- Sort by: Most Recent, Most Voted

### 4.3 Media Attachments

- Image and video uploads on submissions
- Stored in Supabase Storage `feedback-media` bucket
- Inline preview in ticket detail view

### 4.4 Content Moderation

- Users can flag inappropriate feedback
- Staff can review flagged content via management dashboard
- Flagged items hidden from public board pending review

---

## 5. Testing

### Playwright E2E Tests

**Config**: `apps/next-community-voice/playwright.config.ts` (port 3002)\
**Location**: `apps/next-community-voice/e2e/`

| Spec File | Coverage |
| :-------- | :------- |
| `board.spec.ts` | Board listing, filtering, search |
| `submit.spec.ts` | Submission form, validation, auth redirect |
| `ticket-detail.spec.ts` | Ticket view, comments, voting |
| `flagging.spec.ts` | Content flagging flow |

### Unit Tests (Vitest)

**File**: `features/feedback/feedback-service.test.ts` (22KB)\
Covers the data access layer: CRUD operations, voting logic, status transitions,
search queries, and error handling.

### Pre-Push Integration

Both unit tests (Vitest) and Playwright E2E tests are included in the pre-push
hook (`.husky/pre-push` Phase 1 and Phase 2).
