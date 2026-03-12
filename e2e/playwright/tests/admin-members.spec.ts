/**
 * Admin Members Page E2E Tests
 *
 * Tests the member management functionality:
 * - Page renders with search input and title
 * - Email search returns matching users
 * - Show flagged users button works
 * - Ghost toggle updates status
 * - Ghost badge displays correctly
 */

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

test.describe('Admin Members Page', () => {
    test.use({ storageState: 'e2e/playwright/.auth/admin.json' })

    test('page renders with title and search input', async ({ page }) => {
        await page.goto('/members', { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(2000)

        // Title should be visible
        await expect(page.locator('[data-testid="members-title"]')).toBeVisible()
        await expect(page.locator('[data-testid="members-title"]')).toContainText('Member Management')

        // Search section should be visible
        await expect(page.locator('[data-testid="search-section"]')).toBeVisible()
        await expect(page.locator('[data-testid="email-search-input"]')).toBeVisible()
        await expect(page.locator('[data-testid="search-button"]')).toBeVisible()

        // Flagged section should be visible
        await expect(page.locator('[data-testid="flagged-section"]')).toBeVisible()
        await expect(page.locator('[data-testid="show-flagged-button"]')).toBeVisible()
    })

    test('search by email returns matching user', async ({ page }) => {
        await page.goto('/members', { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(2000)

        // Search for buyer@test.local (seeded user)
        await page.locator('[data-testid="email-search-input"]').fill('buyer@test.local')
        await page.locator('[data-testid="search-button"]').click()

        // Wait for results
        await page.waitForSelector('[data-testid="search-results"]', { timeout: 10_000 })

        // Should show at least one result
        const results = page.locator('[data-testid="search-results"]')
        await expect(results).toBeVisible()

        // The result should contain the email
        await expect(results).toContainText('buyer@test.local')
    })

    test('search by partial email works', async ({ page }) => {
        await page.goto('/members', { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(2000)

        // Search with partial email
        await page.locator('[data-testid="email-search-input"]').fill('buyer')
        await page.locator('[data-testid="search-button"]').click()

        // Wait for results  
        await page.waitForSelector('[data-testid="search-results"]', { timeout: 10_000 })

        const results = page.locator('[data-testid="search-results"]')
        await expect(results).toBeVisible()
    })

    test('show flagged users button reveals flagged section', async ({ page }) => {
        await page.goto('/members', { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(2000)

        await page.locator('[data-testid="show-flagged-button"]').click()

        // Should show either flagged users or "no flagged" message 
        // (depends on seed data state)
        await page.waitForTimeout(3000)

        // Either flagged users are shown OR the "no flagged" message is shown
        const noFlagged = page.locator('[data-testid="no-flagged-message"]')
        const flaggedCards = page.locator('[data-testid^="member-card-"]')

        // At least one of these should be visible
        const noFlaggedVisible = await noFlagged.isVisible().catch(() => false)
        const cardsCount = await flaggedCards.count()

        expect(noFlaggedVisible || cardsCount > 0).toBeTruthy()
    })

    test('ghost toggle updates ghost status', async ({ page }) => {
        // Defensive: always start with buyer un-ghosted to avoid cross-test contamination
        await adminDb
            .from('profiles')
            .update({ is_ghosted: false })
            .eq('email', 'buyer@test.local')

        await page.goto('/members', { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(2000)

        // First, search for buyer user
        await page.locator('[data-testid="email-search-input"]').fill('buyer@test.local')
        await page.locator('[data-testid="search-button"]').click()
        await page.waitForSelector('[data-testid="search-results"]', { timeout: 10_000 })

        // Get the buyer's profile ID
        const { data: buyer } = await adminDb
            .from('profiles')
            .select('id, is_ghosted')
            .eq('email', 'buyer@test.local')
            .single()

        expect(buyer).toBeTruthy()
        expect(buyer!.is_ghosted).toBe(false) // Should be un-ghosted at start

        // Click the ghost toggle (sets to ghosted)
        const toggleBtn = page.locator(`[data-testid="ghost-toggle-${buyer!.id}"]`)
        await expect(toggleBtn).toBeVisible()
        await toggleBtn.click()

        // Wait for the update
        await page.waitForTimeout(2000)

        // Verify the database was updated to ghosted
        const { data: updated } = await adminDb
            .from('profiles')
            .select('is_ghosted')
            .eq('id', buyer!.id)
            .single()

        expect(updated!.is_ghosted).toBe(true)

        // The badge should show Ghosted
        const badge = page.locator(`[data-testid="ghost-badge-${buyer!.id}"]`)
        await expect(badge).toContainText('Ghosted')

        // Clean up: ALWAYS restore to un-ghosted
        await adminDb
            .from('profiles')
            .update({ is_ghosted: false })
            .eq('id', buyer!.id)
    })

    test('members sidebar link is visible', async ({ page }) => {
        await page.goto('/platform-settings', { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(2000)

        // The sidebar should have a "Members" link
        const membersLink = page.locator('text=Members').first()
        await expect(membersLink).toBeVisible()
    })
})
