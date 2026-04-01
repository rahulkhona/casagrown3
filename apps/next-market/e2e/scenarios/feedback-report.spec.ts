import { test, expect } from '@playwright/test'
import { loginAsUser } from './scenario-helpers'
import { execSync } from 'child_process'

test.describe('Header Bug Report Feature', () => {
  test('successfully sends a bug report and populates all database fields', async ({ browser }) => {
    const page = await loginAsUser(browser, 'beth')
    await page.goto('/')

    // Click the bug icon in the header
    await page.locator('button[title="Report a bug or send feedback"]').click()

    // Wait for the modal to open (html2canvas often takes several seconds to generate the screenshot)
    const modalHeader = page.getByText(/Report a Bug/i, { exact: false }).first()
    await expect(modalHeader).toBeVisible({ timeout: 15000 })

    // Type a test message
    const uniqueBugMessage = `E2E Playwright Bug Report Test ${Date.now()}`
    await page.locator('textarea[placeholder*="What went wrong"]').fill(uniqueBugMessage)

    // Submit the report
    await page.getByRole('button', { name: /Submit Report/i }).click()

    // Wait for the success "Thank you!" screen
    await expect(page.getByText('Thank you!', { exact: true })).toBeVisible({ timeout: 10000 })

    // Give the database a tiny bit of time to settle the transaction
    await page.waitForTimeout(500)

    // Query the database directly to assert that the record was created with the proper columns
    const dbOutput = execSync(
      `docker exec -i supabase_db_casagrown3 psql -U postgres -t -c "SELECT title, message, visibility FROM user_feedback WHERE message LIKE '%${uniqueBugMessage}%' LIMIT 1"`,
      { encoding: 'utf-8' }
    ).trim()

    console.log('[DB RAW OUTPUT]', dbOutput)

    // The output should contain our test message in both the title and the message columns
    expect(dbOutput.includes(uniqueBugMessage)).toBeTruthy()
    expect(dbOutput.includes('public')).toBeTruthy()

    await page.context().close()
  })
})
