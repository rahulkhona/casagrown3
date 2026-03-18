import { expect, test } from "@playwright/test";

test.describe("Community Chat Feature", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the community chat page and wait for it
    await page.goto("/community");
    
    // Check that we aren't redirected to login
    expect(page.url()).not.toContain("/login");
    
    // Wait for the chat to load (message area or empty state should be visible)
    const messageArea = page.locator('[class*="messageScrollArea"]');
    const emptyState = page.locator('text=Be the first to say hello!');
    await expect(messageArea.or(emptyState)).toBeVisible({ timeout: 15_000 });
  });

  test("should load the chat page without redirecting", async ({ page }) => {
    expect(page.url()).toContain("/community");
  });

  test('should display empty state or list of messages', async ({ page }) => {
    const emptyState = page.locator('text=Be the first to say hello!');
    const messageScrollArea = page.locator('[class*="messageScrollArea"]');
    
    await expect(emptyState.or(messageScrollArea)).toBeVisible({ timeout: 5000 });
  });

  test('should allow sending a new message', async ({ page }) => {
    const testMessage = `Test message ${Date.now()}`;
    
    const textarea = page.getByPlaceholder('Type a message...');
    await textarea.fill(testMessage);
    
    const sendButton = page.getByRole('button', { name: 'Send Message' });
    await sendButton.click();
    
    await expect(page.locator(`text=${testMessage}`)).toBeVisible({ timeout: 5000 });
  });

  test('should support quick reply suggestions', async ({ page }) => {
    const chips = page.locator('[class*="suggestionChip"]');
    const chipCount = await chips.count();
    
    if (chipCount > 0) {
      const chipText = await chips.first().textContent();
      await chips.first().click();
      
      if (chipText) {
        await expect(page.locator(`text=${chipText}`).last()).toBeVisible({ timeout: 5000 });
      }
    } else {
      test.skip();
    }
  });

  test('should open mention picker when typing @', async ({ page }) => {
    const textarea = page.getByPlaceholder('Type a message...');
    await textarea.pressSequentially('Hello @S', { delay: 50 });
    
    const picker = page.locator('[class*="mentionPicker"]');
    await expect(picker).toBeVisible({ timeout: 5000 });
  });

  // ── Bot Message Tests ──────────────────────────────────────

  test('should display bot messages with distinct styling', async ({ page }) => {
    // Look for bot messages (they have BOT badge)
    const botBadge = page.locator('[class*="botBadge"]');
    const botBadgeCount = await botBadge.count();
    
    if (botBadgeCount > 0) {
      // Bot messages should have the BOT badge text
      await expect(botBadge.first()).toContainText('BOT');
      
      // Bot messages should show CasaGrown as author
      const botMessage = botBadge.first().locator('xpath=ancestor::div[contains(@class,"messageWrapper")]');
      await expect(botMessage).toContainText('CasaGrown');
      
      // Bot messages should have the bee emoji in avatar
      const avatar = botMessage.locator('[class*="botAvatar"]');
      await expect(avatar).toContainText('🐝');
      
      // Bot bubble should have distinct styling
      const bubble = botMessage.locator('[class*="botBubble"]');
      await expect(bubble).toBeVisible();
    } else {
      // No bot messages seeded — skip
      test.skip();
    }
  });

  test('bot messages should be tappable for actions', async ({ page }) => {
    const botBubble = page.locator('[class*="botBubble"]').first();
    
    if (await botBubble.isVisible().catch(() => false)) {
      await botBubble.click();
      
      // Action bar should appear
      const actionBar = page.locator('[class*="tapActionBar"]');
      await expect(actionBar).toBeVisible({ timeout: 3000 });
      
      // Should have emoji buttons
      const emojis = actionBar.locator('[class*="tapActionEmoji"]');
      expect(await emojis.count()).toBeGreaterThan(0);
      
      // Inline reply input should also appear
      const replyInput = page.locator('[class*="inlineReplyInput"]').first();
      await expect(replyInput).toBeVisible({ timeout: 3000 });
    } else {
      test.skip();
    }
  });

  // ── Inline Reply Tests ─────────────────────────────────────

  test('tapping a message shows inline reply input', async ({ page }) => {
    const messageScrollArea = page.locator('[class*="messageScrollArea"]');
    
    if (await messageScrollArea.isVisible().catch(() => false)) {
      // Tap the first message bubble
      const firstBubble = page.locator('[class*="messageBubble"]').first();
      await firstBubble.click();
      
      // Should show the inline reply input
      const replyInput = page.locator('[class*="inlineReplyInput"]').first();
      await expect(replyInput).toBeVisible({ timeout: 3000 });
    } else {
      test.skip();
    }
  });

  test('can type and send an inline reply', async ({ page }) => {
    const firstBubble = page.locator('[class*="messageBubble"]').first();
    
    if (await firstBubble.isVisible().catch(() => false)) {
      await firstBubble.click();
      
      const replyInput = page.locator('[class*="inlineReplyInput"]').first();
      await expect(replyInput).toBeVisible({ timeout: 3000 });
      
      const replyText = `Reply test ${Date.now()}`;
      await replyInput.fill(replyText);
      
      // Click the send button
      const sendBtn = page.locator('[class*="inlineReplySend"]').first();
      await sendBtn.click();
      
      // Reply should appear in thread
      await expect(page.locator(`text=${replyText}`)).toBeVisible({ timeout: 5000 });
    } else {
      test.skip();
    }
  });

  // ── Thread Tests ───────────────────────────────────────────

  test('messages with replies auto-display thread replies', async ({ page }) => {
    // Look for thread reply items (auto-fetched for messages with replies)
    const threadReplies = page.locator('[class*="threadReplyItem"]');
    const replyCount = await threadReplies.count();
    
    if (replyCount > 0) {
      // Thread replies should show author name and text
      const firstReply = threadReplies.first();
      const authorEl = firstReply.locator('[class*="threadReplyAuthor"]');
      await expect(authorEl).toBeVisible();
      
      const textEl = firstReply.locator('[class*="threadReplyText"]');
      await expect(textEl).toBeVisible();
    }
    // No assertion failure if no threads exist — just verifying structure when present
  });

  // ── Navigation Tests ───────────────────────────────────────

  test('page title should be Buzz | CasaGrown', async ({ page }) => {
    await expect(page).toHaveTitle(/Buzz.*CasaGrown/);
  });

  test('navigation should show Buzz label', async ({ page }) => {
    // The bottom nav or header nav should show "Buzz 🐝"
    const navText = page.locator('text=Buzz 🐝');
    await expect(navText.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Compose Bar Tests ──────────────────────────────────────

  test('compose bar should have attach and send buttons', async ({ page }) => {
    const attachBtn = page.locator('[class*="attachBtn"]');
    await expect(attachBtn).toBeVisible();
    
    const sendBtn = page.getByRole('button', { name: 'Send Message' });
    await expect(sendBtn).toBeVisible();
  });

  test('attach button should show photo options popup', async ({ page }) => {
    const attachBtn = page.locator('[class*="attachBtn"]');
    await attachBtn.click();
    
    const popup = page.locator('[class*="attachPopup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });
    
    // Should have Take Photo and Photo Library options
    await expect(page.locator('text=Take Photo')).toBeVisible();
    await expect(page.locator('text=Photo Library')).toBeVisible();
  });
});
