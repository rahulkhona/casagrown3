import { expect, test } from "@playwright/test";
import { dbDelete, dbQuery } from "../helpers/supabase-db";

const UNIQUE = `PW_TUT_${Date.now()}`;

test.describe("Admin Tutorials Management", () => {
    test.beforeEach(async ({ page }) => {
        // Clear any pre-existing test tutorials to keep a clean state
        const existing = await dbQuery("tutorial_sections", "title=like.PW_TUT_*");
        for (const item of existing) {
            await dbDelete("tutorial_sections", `id=eq.${item.id}`);
        }

        await page.goto("/crm/tutorials");
        await page.getByText("Tutorials Management", { exact: true }).first().waitFor({ timeout: 15_000 });
    });

    test.afterAll(async () => {
        // Cleanup after all tests finish
        const existing = await dbQuery("tutorial_sections", "title=like.PW_TUT_*");
        for (const item of existing) {
            await dbDelete("tutorial_sections", `id=eq.${item.id}`);
        }
    });

    test("renders tutorials list page with header and Add Tutorial button", async ({ page }) => {
        await expect(page.getByText("Tutorials Management", { exact: true }).first()).toBeVisible();
        await expect(page.locator("text=Add Tutorial")).toBeVisible();
    });

    test("shows form validation errors when trying to submit empty form", async ({ page }) => {
        await page.locator("text=Add Tutorial").click();
        await expect(page.locator("text=Add New Video Tutorial")).toBeVisible();

        // Submit form immediately
        await page.locator("text=Save Tutorial").click();

        // Validation for title
        await expect(page.locator("text=Please enter a tutorial title.")).toBeVisible();

        // Fill title, submit again
        await page.locator('input[placeholder*="Produce Stand"]').fill("PW_TUT_Validation");
        await page.locator("text=Save Tutorial").click();

        // Validation for video URL
        await expect(page.locator("text=Please enter a video URL.")).toBeVisible();

        // Fill video URL, submit again
        await page.locator('input[placeholder*="youtube.com"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        await page.locator("text=Save Tutorial").click();

        // Validation for description
        await expect(page.locator("text=Please enter a description.")).toBeVisible();
    });

    test("creates, edits, and deletes a video tutorial, verifying database state", async ({ page }) => {
        const title = `PW_TUT Title ${UNIQUE}`;
        const updatedTitle = `${title} Updated`;
        const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        const descText = "This is a rich text test description for the video tutorial.";

        // 1. CREATE
        await page.locator("text=Add Tutorial").click();
        await page.locator('input[placeholder*="Produce Stand"]').fill(title);
        await page.locator('input[placeholder*="youtube.com"]').fill(videoUrl);

        // Interact with the Quill editor
        const quillEditor = page.locator(".ql-editor");
        await expect(quillEditor).toBeVisible();
        await quillEditor.focus();
        await quillEditor.pressSequentially(descText);

        // Click "Save Tutorial"
        await page.locator("text=Save Tutorial").click();

        // Wait for success toast/banner
        await expect(page.locator(`text=/Tutorial.*created successfully/`)).toBeVisible({ timeout: 10_000 });

        // Verify database entry was inserted
        let dbRows = await dbQuery("tutorial_sections", `title=eq.${encodeURIComponent(title)}`);
        expect(dbRows.length).toBe(1);
        const tutorialId = dbRows[0].id;
        expect(dbRows[0].video_url).toBe(videoUrl);
        expect(dbRows[0].description.replace(/&nbsp;|\u00a0/g, " ")).toContain(descText);
        expect(dbRows[0].is_published).toBe(true);

        // 2. EDIT
        const editButton = page.locator(`[data-testid="tutorial-edit-${tutorialId}"]`);
        await expect(editButton).toBeVisible();
        await editButton.click();

        await expect(page.locator(`text=Edit Tutorial: ${title}`)).toBeVisible();

        // Modify title
        const titleInput = page.locator('input[placeholder*="Produce Stand"]');
        await titleInput.clear();
        await titleInput.fill(updatedTitle);

        // Click "Save Tutorial"
        await page.locator("text=Save Tutorial").click();

        // Wait for update success toast
        await expect(page.locator(`text=/Tutorial.*updated successfully/`)).toBeVisible({ timeout: 10_000 });

        // Verify database updated
        dbRows = await dbQuery("tutorial_sections", `id=eq.${tutorialId}`);
        expect(dbRows.length).toBe(1);
        expect(dbRows[0].title).toBe(updatedTitle);

        // 3. DELETE
        const deleteButton = page.locator(`[data-testid="tutorial-delete-${tutorialId}"]`);
        await expect(deleteButton).toBeVisible();
        await deleteButton.click();

        // Verify our styled confirmation modal is open
        const confirmModal = page.locator("text=Delete Tutorial").first();
        await expect(confirmModal).toBeVisible();
        await expect(page.locator(`text=Are you sure you want to delete the tutorial "${updatedTitle}"?`)).toBeVisible();

        // Click "Yes, delete" inside the modal
        await page.locator('button:has-text("Yes, delete")').click();

        // Wait for success message
        await expect(page.locator(`text=/Tutorial.*deleted successfully/`)).toBeVisible({ timeout: 10_000 });

        // Verify deleted from database
        dbRows = await dbQuery("tutorial_sections", `id=eq.${tutorialId}`);
        expect(dbRows.length).toBe(0);
    });
});
