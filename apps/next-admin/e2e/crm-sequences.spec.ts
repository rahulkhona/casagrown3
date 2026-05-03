import { test, expect } from '@playwright/test';

test.describe('CRM Sequences & Editor Backward Compatibility', () => {
  // Wait for the app to load before each test
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');
    // Assuming local test environment auto-authenticates or is configured
  });

  test('Test 1: Backward Compatibility of the Extracted Editor', async ({ page }) => {
    // Navigate to Campaigns page
    await page.goto('/crm/campaigns');
    
    // Assert: The page header <h1> contains "Campaign"
    await expect(page.locator('h1')).toContainText('Campaign');

    // Interact: Click button with text "New Campaign"
    await page.getByRole('button', { name: /New Campaign/ }).click();

    // Assert: Form modal appears (.crm-form-card is visible)
    const formCard = page.locator('.crm-form-card');
    await expect(formCard).toBeVisible({ timeout: 10000 });

    // Interact: Fill input labeled "Campaign Name"
    await page.getByPlaceholder('e.g. Spring Launch Email').fill('E2E Test Campaign');

    // Interact: Select "Email" from the Channel <select> inside the editor
    await page.locator('label:has-text("Channel") + select, label:has-text("Channel") ~ select').selectOption('email');

    // Assert: textarea labeled "Email Subject" becomes visible. Fill it.
    const subjectInput = page.locator('textarea[placeholder*="Fresh produce"]');
    await expect(subjectInput).toBeVisible({ timeout: 10000 });
    await subjectInput.fill('E2E Subject');

    // Assert: <ReactQuill> editor component is visible.
    const quillEditor = page.locator('.ql-editor');
    await expect(quillEditor).toBeVisible();

    // Note: Interacting with the Quill Image picker is complex in headless mode 
    // due to the hidden file input. We will assert the toolbar exists.
    const imageBtn = page.locator('.ql-image');
    await expect(imageBtn).toBeVisible();

    // Interact: Click button "Preview Email"
    await page.getByRole('button', { name: /Preview Email/ }).click();

    // Assert: Preview modal opens
    const previewModal = page.locator('.modal-overlay h3:has-text("Email Preview")');
    await expect(previewModal).toBeVisible();
    
    // Close preview
    await page.getByRole('button', { name: '✕ Close' }).click();

    // Wait for close
    await expect(previewModal).not.toBeVisible();
  });

  test('Test 2: Sequence Builder Flow (Drafting)', async ({ page }) => {
    // Interact: Navigate to /crm/sequences
    await page.goto('/crm/sequences');

    // Assert: button "+ New Sequence" is visible. Click it.
    const newSeqBtn = page.getByRole('button', { name: '+ New Sequence' });
    await expect(newSeqBtn).toBeVisible();
    
    // We mock the DB creation by just verifying the button works and navigates
    // Since we don't want to pollute DB in pure UI test without setup, we will just test the UI exists
    // To do a real click, we would need to mock the Supabase client or allow DB write.
    // For this test, we assume the test environment allows DB writes.
    await newSeqBtn.click();

    // Wait for navigation to /crm/sequences/[id]
    await page.waitForURL(/\/crm\/sequences\/[a-zA-Z0-9-]+/);

    // Assert: React Flow canvas .react-flow is visible on screen.
    const reactFlow = page.locator('.react-flow');
    await expect(reactFlow).toBeVisible();

    // Assert: A default "Start" node is visible on the canvas.
    const startNode = page.locator('.react-flow__node:has-text("Start")');
    await expect(startNode).toBeVisible();

    // React Flow drag and drop is complex in Playwright, 
    // but we can assert the Sidebar Node Types exist
    await expect(page.locator('text=Node Types')).toBeVisible();
    await expect(page.locator('text=✉️ Send Email')).toBeVisible();
    await expect(page.locator('text=⏳ Wait Delay')).toBeVisible();

    // Assert global Save button exists
    const saveBtn = page.getByRole('button', { name: 'Save Sequence' });
    await expect(saveBtn).toBeVisible();
  });

  test('Test 3: Sequence Activation & Structural Locking', async ({ page }) => {
    // Navigate to sequences list and create a new one to activate
    await page.goto('/crm/sequences');
    const newSeqBtn = page.getByRole('button', { name: '+ New Sequence' });
    await expect(newSeqBtn).toBeVisible();
    await newSeqBtn.click();
    await page.waitForURL(/\/crm\/sequences\/[a-zA-Z0-9-]+/);

    // Wait for sequence to fully load (loading guard disappears when Save button appears)
    const saveBtn = page.locator('button:has-text("Save Sequence")');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });

    // Assert: "Activate Sequence" button visible (implicitly confirms draft state — not locked)
    const activateBtn = page.locator('button:has-text("Activate Sequence")');
    await expect(activateBtn).toBeVisible({ timeout: 10000 });

    // Interact: Click "Activate Sequence"
    await activateBtn.click();

    // Assert: Locked state appears — "Active - Structural Edits Locked" button replaces Activate
    const lockedBtn = page.locator('button:has-text("Active - Structural Edits Locked")');
    await expect(lockedBtn).toBeVisible({ timeout: 10000 });
    await expect(activateBtn).not.toBeVisible({ timeout: 3000 });

    // Assert: Node palette "Node Types" section remains visible after locking
    await expect(page.locator('text=Node Types')).toBeVisible();
  });
});
