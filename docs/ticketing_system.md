# CasaGrown Community Voice — Ticketing System

## Overview

Community Voice is a feedback and support ticketing system embedded within the
CasaGrown ecosystem. It lets community members report bugs, request features,
and submit private support requests. Staff can triage, update statuses, moderate
flagged content, and respond officially.

**Application**: `apps/next-community-voice` (Next.js + Tamagui) **Database**:
Supabase (PostgreSQL + RLS)

---

## Ticket Types

| Type            | Enum Value        | Visibility | Description                        |
| :-------------- | :---------------- | :--------- | :--------------------------------- |
| Bug Report      | `bug_report`      | Public     | Something broken or unexpected     |
| Feature Request | `feature_request` | Public     | New functionality suggestion       |
| Support Request | `support_request` | Private    | User-specific issue (points, etc.) |

Support tickets are **private** — only visible to the author and staff.

---

## User Roles

### Community Members

- Submit tickets (bug, feature, support)
- Vote on public tickets
- Comment on public tickets
- Flag offensive content
- View own private support tickets

### Staff

- View all tickets (including private support)
- Change ticket status (`open` → `in_progress` → `planned` → `completed` →
  `wont_fix`)
- Post official responses (comments with `OFFICIAL` badge)
- Filter by flagged content
- Dismiss flags or delete tickets
- View reporting dashboard (stats, charts)

Staff is determined via the `community_voice_staff` table:

```sql
select * from community_voice_staff where email = ?
```

---

## Submit Flow

### Support Requests

Direct URL: `/submit?type=support` → Opens the form immediately (support tickets
are unique per user, no duplicate search needed)

### Bug Reports & Feature Requests

Direct URL: `/board` → User lands on the board → searches existing tickets →
upvotes or comments if found → clicks "Report Issue" or "Suggest Feature" to
file new

Within the app, the board buttons link to `/submit?type=bug` and
`/submit?type=feature`.

---

## Voting System

- Any authenticated user can upvote a public ticket (one vote per user)
- Clicking the vote arrow toggles the vote
- Unauthenticated users are redirected to login with `returnTo` preserved
- Table: `feedback_votes` (composite PK: `feedback_id` + `user_id`)

---

## Comments

- Any authenticated user can comment on public tickets
- Comments support text and media attachments (images, videos, documents)
- Staff comments can be marked as **official responses**
  (`is_official_response = true`)
- Official comments display with an `OFFICIAL` badge
- Attachment storage: Supabase Storage → `feedback_comment_media` junction table

---

## Content Flagging

### Flagging Flow

1. User clicks the flag icon on a ticket card or detail page
2. Flag is inserted into `feedback_flags` (one per user per ticket)
3. Flag count displayed next to the icon (red when > 0)
4. Clicking again unflagsRemoves the user's flag)

### Staff Moderation

- **Flagged filter**: toggle on the board to show only flagged tickets
- **Dismiss Flags**: clears all flags on a ticket (keeps the ticket)
- **Delete Post**: permanently removes the ticket and all associated data

### RLS Policies

| Rule                            | Effect                               |
| :------------------------------ | :----------------------------------- |
| `user_id = auth.uid()`          | Users can see/delete their own flags |
| `is_staff(auth.uid())`          | Staff can see/delete any flag        |
| `user_id = auth.uid()` (INSERT) | Any authenticated user can flag      |

---

## Data Model

### Tables

| Table                    | Purpose                                                         |
| :----------------------- | :-------------------------------------------------------------- |
| `user_feedback`          | Core ticket data (title, description, type, status, visibility) |
| `feedback_votes`         | Upvotes (composite PK: feedback_id + user_id)                   |
| `feedback_comments`      | Comments with optional official response flag                   |
| `feedback_media`         | Ticket-level media attachments (via media_assets)               |
| `feedback_comment_media` | Comment-level media attachments (via media_assets)              |
| `feedback_flags`         | Content flags (unique per user per ticket)                      |
| `community_voice_staff`  | Staff whitelist (email-based)                                   |

### Status Lifecycle

```
open → in_progress → planned → completed
  └─────────────────────────────→ wont_fix
```

---

## URL Reference

| Purpose                 | URL                    | Auth Required     |
| :---------------------- | :--------------------- | :---------------- |
| Board (search + browse) | `/board`               | No                |
| Ticket detail           | `/board/{id}`          | No                |
| Submit bug              | `/submit?type=bug`     | Yes (at submit)   |
| Submit feature          | `/submit?type=feature` | Yes (at submit)   |
| Submit support          | `/submit?type=support` | Yes (at submit)   |
| Staff login             | `/staff/login`         | Staff credentials |
| Staff dashboard         | `/staff/dashboard`     | Staff only        |

---

## Service Functions

Key functions in `features/feedback/feedback-service.ts`:

| Function                                  | Description                                         |
| :---------------------------------------- | :-------------------------------------------------- |
| `fetchTickets(params)`                    | Paginated ticket list with filters, search, sorting |
| `fetchTicketById(id)`                     | Single ticket with comments, media, flag counts     |
| `createTicket(data)`                      | Create new ticket (auto-sets visibility by type)    |
| `toggleVote(feedbackId, userId, isVoted)` | Toggle upvote                                       |
| `addComment(data)`                        | Add comment with optional media                     |
| `updateTicketStatus(id, status)`          | Staff: change ticket status                         |
| `flagTicket(feedbackId, userId, reason?)` | Flag a ticket                                       |
| `unflagTicket(feedbackId, userId)`        | Remove own flag                                     |
| `deleteFeedback(feedbackId)`              | Delete a ticket                                     |
| `dismissAllFlags(feedbackId)`             | Staff: clear all flags on a ticket                  |
| `checkIsStaff(userId)`                    | Check if user is staff by ID                        |
| `checkIsStaffByEmail(email)`              | Check if user is staff by email                     |
| `fetchReportStats()`                      | Dashboard statistics                                |
| `fetchReporters()`                        | Unique reporter names for filter typeahead          |
