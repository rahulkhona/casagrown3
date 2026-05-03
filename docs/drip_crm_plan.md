# Implementation Plan: Flowchart-Based Automation Sequences

## 1. Goal
Implement a Directed Acyclic Graph (DAG) based automation engine for CRM drip campaigns. Sequences will support event-based triggers, audience snapshots, conditional branching via Postgres RPCs, and time delays.

## 2. Backward Compatibility (Zero Breakage)
**Crucially, we will NOT modify the existing single-shot campaign system.**
The existing `crm_campaigns` table and its associated UI will remain untouched for sending quick newsletters or blasts. 

Sequences will live in entirely **new tables**:
- `crm_sequences` (The JSONB graph definition)
- `crm_sequence_enrollments` (Tracking where users are)

The *only* modification to an existing table will be adding two nullable columns (`sequence_id`, `node_id`) to the tracking table `crm_campaign_sends` so that we can track opens/clicks for sequence steps just like we do for single-shot campaigns without breaking existing analytics.

---

## 3. UI Experience: Reusable Campaign Editor

After a thorough review of the existing `/crm/campaigns/page.tsx`, I see that the email/sms editing experience is highly complex. It contains:
- Custom / Postmark Template modes
- WYSIWYG vs Raw HTML toggle
- "Pretty Print" formatter
- `ReactQuill` integration with custom Image Asset Picker and Promo Link handlers
- Plain Text Fallback fields
- Email Preview Modals
- Ad-hoc Test Email fields
- Data Provider (Hydration) dropdowns

To guarantee we don't spin our wheels or lose any functionality, **we will refactor the UI to extract this entire editor into a reusable React component (e.g., `<CampaignMessageEditor />`).**

1. **Extraction:** We will pull the message-editing logic out of `crm/campaigns/page.tsx` into a standalone component.
2. **Current UI:** We will drop `<CampaignMessageEditor />` back into the existing campaigns page so it functions exactly as it does today.
3. **Sequence UI:** When you click a node in the visual Sequence Builder (React Flow), the right-hand sidebar will render that exact same `<CampaignMessageEditor />`. 

*Result:* 100% feature parity. Anything you can do in a single-shot campaign (inserting assets, raw HTML editing, testing emails), you can do inside a Sequence step, with zero duplicated code.

---

## 4. Technical Architecture

### A. Graph Definition & Type Safety (JSONB)
To ensure the `definition` JSONB field isn't arbitrary data, we will enforce a strict schema using **Zod** in the application layer (Next.js and Edge Functions). 

```typescript
type SequenceNode = 
  | { id: string, type: 'action_email', data: { subject: string, html: string, text?: string, postmark_template_alias?: string, data_source_id?: string } }
  | { id: string, type: 'action_sms', data: { text: string, data_source_id?: string } }
  | { id: string, type: 'wait', data: { delayDays: number, delayHours: number } }
  | { id: string, type: 'condition', data: { rpcName: string, config?: any } };

type SequenceEdge = {
  id: string;
  source: string;  // node_id
  target: string;  // node_id
  label?: string;  // e.g., 'true', 'false'
};

type SequenceDefinition = {
  nodes: SequenceNode[];
  edges: SequenceEdge[];
  startNodeId: string;
};
```

### B. Versioning Strategy
**Rule:** Once a sequence is moved from `draft` to `active`, the **structure of the graph is locked**. 
- You **cannot** add/remove nodes or change edges.
- You **can** edit the `data` payload of Action nodes (e.g., use the `<CampaignMessageEditor />` to fix a typo in the HTML body or change the subject).

---

## 5. Database Schema (1 Migration)

**`crm_sequences`**
```sql
id              UUID PK
name            TEXT NOT NULL
status          TEXT DEFAULT 'draft'  -- draft | active | archived
trigger_event   TEXT                  -- manual | lead_captured | etc.
definition      JSONB NOT NULL        -- The Zod-validated DAG
created_by      UUID
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

**`crm_sequence_enrollments`**
```sql
id                  UUID PK
sequence_id         UUID → crm_sequences(id)
recipient_type      TEXT NOT NULL  -- lead | user
recipient_id        UUID NOT NULL
current_node_id     TEXT           -- references a node ID in the JSONB
next_evaluation_at  TIMESTAMPTZ    -- when the cron should check this user again
status              TEXT DEFAULT 'active' -- active | completed | unsubscribed
enrolled_at         TIMESTAMPTZ
created_at          TIMESTAMPTZ
UNIQUE(sequence_id, recipient_type, recipient_id)
```

**`crm_campaign_sends` (Modified)**
Add `sequence_id` (UUID) and `node_id` (TEXT) columns to the existing table to track opens/clicks for specific nodes in a sequence.

---

## 6. Edge Functions

### `process-sequence-step` (Cron: Every 15 minutes)
1. Load active enrollments where `next_evaluation_at <= NOW()`.
2. Find the node matching `current_node_id`.
3. **If Wait Node:** Calculate the future time, update `next_evaluation_at`.
4. **If Action Node (Email):** Wrap links in `/r/[token]`, send via Postmark. Insert `crm_campaign_sends` row. Update to `next_node_id`, set `next_evaluation_at` to NOW().
5. **If Action Node (SMS - STUBBED):** Wrap links in `/r/[token]`. Instead of calling the Twilio API, emit a `console.log` containing the SMS text and recipient info (which goes to the Edge Function logs), and insert a row into `crm_campaign_sends` with `status='mock_sent'`. Update to `next_node_id`, set `next_evaluation_at` to NOW().
6. **If Condition Node:** Call Postgres RPC. Follow the `true` or `false` edge based on the result, set `next_evaluation_at` to NOW().

---

## 7. Comprehensive Verification Plan

To ensure zero regressions on existing campaigns and 100% reliability for the new DAG engine, the following tests will be built and added to `release-test.sh`.

### A. Playwright E2E Tests: UI Interaction & Granular Assertions
**File:** `apps/next-admin/e2e/crm-sequences.spec.ts`

**Test 1: Backward Compatibility of the Extracted Editor**
*User Flow:* Go to Campaigns page, create a new single-shot campaign using the extracted React component to ensure nothing broke.
- **Assert:** The page header `<h1>` contains "Email / SMS Campaigns".
- **Interact:** Click `button` with text "+ New Campaign".
- **Assert:** Form modal appears (`.crm-form-card` is visible).
- **Interact:** Fill `input` labeled "Campaign Name".
- **Interact:** Select "Email" from the Channel `<select>`.
- **Interact:** Select "Custom HTML / Subject" from Design Mode `<select>`.
- **Assert:** `input` labeled "Email Subject" becomes visible. Fill it.
- **Assert:** `<ReactQuill>` editor component is visible.
- **Interact:** Click the "Image" tool in the Quill toolbar.
- **Assert:** The Asset Picker modal opens and displays a list of images (`.asset-item`).
- **Interact:** Click the first image in the Asset Picker.
- **Assert:** Asset modal closes, and the `<img src="..."/>` is successfully injected into the Quill editor HTML.
- **Interact:** Click `button` labeled "Preview Email".
- **Assert:** Preview modal opens, and the subject and HTML are rendered correctly inside. Close preview.
- **Interact:** Click `button` "Save Campaign".
- **Assert:** Toast notification `.crm-toast.success` appears with text "Campaign created".
- **Assert:** The new campaign appears as the first row in the `.crm-table` with status "Draft".

**Test 2: Sequence Builder Flow (Drafting)**
*User Flow:* Create a new Sequence from scratch, drag nodes onto the canvas, connect them, and save.
- **Interact:** Navigate to `/crm/sequences`.
- **Assert:** `button` "+ New Sequence" is visible. Click it.
- **Assert:** Page URL changes to `/crm/sequences/new`.
- **Assert:** React Flow canvas `.react-flow` is visible on screen.
- **Assert:** A default "Start" node is visible on the canvas.
- **Interact:** Drag an "Action: Email" item from the Node Palette sidebar onto the canvas.
- **Assert:** An "Action: Email" node is rendered on the canvas.
- **Interact:** Drag a connection line from the "Start" node's output handle to the "Email" node's input handle.
- **Assert:** An SVG `<path>` edge is rendered connecting the two nodes.
- **Interact:** Click the "Action: Email" node on the canvas.
- **Assert:** The right-hand Configuration Sidebar opens.
- **Assert:** The exact same `<CampaignMessageEditor />` elements (Subject input, Quill editor, Plain text fallback) are visible inside the sidebar.
- **Interact:** Fill Subject and HTML. Click "Save Node" within the sidebar.
- **Interact:** Drag a "Wait" node onto canvas, connect Email -> Wait.
- **Interact:** Click "Wait" node. 
- **Assert:** Sidebar opens with `<input type="number">` fields for "Days" and "Hours". Fill them. Save Node.
- **Interact:** Click global `button` "Save Sequence".
- **Assert:** Toast notification appears with text "Sequence saved successfully".

**Test 3: Sequence Activation & Structural Locking**
*User Flow:* Activate a drafted sequence, prove that the canvas locks structural edits, but prove the admin can still edit email copy.
- **Interact:** Navigate to a drafted sequence's builder page.
- **Interact:** Click `button` "Activate Sequence".
- **Assert:** Confirmation dialog appears. Click "Confirm".
- **Assert:** Sequence status badge changes text from "Draft" to "Active".
- **Assert:** The Node Palette (drag-and-drop source) is either hidden or all items have the `disabled` attribute.
- **Interact:** Attempt to drag an edge from an existing node to another node or select an edge and press 'Backspace'.
- **Assert:** The React Flow canvas blocks the action (edges are locked, `nodesDraggable={false}`).
- **Interact:** Click an existing "Action: Email" node.
- **Assert:** The Configuration Sidebar opens.
- **Assert:** The Subject `input` and Quill editor are STILL enabled and editable.
- **Interact:** Modify the subject text and click "Save Node".
- **Assert:** Toast notification "Changes Saved" appears, proving copy edits are allowed on active sequences.

### B. Deno Integration Tests (Edge Functions)
**File:** `supabase/functions/_tests/sequence-engine.test.ts`
1. **Test: Linear Sequence Execution**
   - *Setup:* Mock a 3-node sequence definition JSON.
   - *Action:* Run `process-sequence-step`.
   - *Assertions:* Asserts Postmark fetch was called. Asserts `current_node_id` advanced correctly. Asserts `next_evaluation_at` time math is accurate.
2. **Test: SMS Stubbing Logic**
   - *Setup:* Mock a sequence with an Action: SMS node.
   - *Action:* Run `process-sequence-step`.
   - *Assertions:* Asserts Twilio API was NOT called. Asserts `console.log` output contains the correct SMS text and target phone number. Asserts a tracking row with `status='mock_sent'` was inserted into `crm_campaign_sends`.
3. **Test: Conditional Branching (DAG Evaluation)**
   - *Setup:* Mock a condition node pointing to a mock RPC. User A evaluates true, User B evaluates false.
   - *Action:* Run `process-sequence-step`.
   - *Assertions:* Asserts User A's `current_node_id` advanced along the `true` edge, and User B along the `false` edge.
4. **Test: Zod JSONB Schema Rejection**
   - *Action:* Call `enroll-in-sequence` with invalid sequence JSON.
   - *Assertions:* Asserts 400 Bad Request is returned before touching the DB.

### C. pgTAP Database Tests (Schema & Integrity)
**File:** `supabase/tests/database/crm_sequences.test.sql`
1. **Test: Enrollment Uniqueness**
   - *Action:* Attempt to insert two active enrollments for the same user in the same sequence.
   - *Assertions:* Asserts PG raises a unique constraint violation error.
2. **Test: Cascading Deletes**
   - *Action:* Delete a `crm_sequences` row.
   - *Assertions:* Asserts all child `crm_sequence_enrollments` are automatically deleted to prevent orphaned state.
