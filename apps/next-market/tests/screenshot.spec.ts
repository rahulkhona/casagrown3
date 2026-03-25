import { test, expect } from '@playwright/test';

test('take screenshots of new booth features', async ({ page }) => {
  // 1. Login
  await page.goto('http://localhost:3001/login');
  await page.fill('input[type="email"]', 'seller@test.local');
  await page.click('button:has-text("Continue with Email")');
  await page.waitForTimeout(500);

  // Read Mailpit
  const req = await fetch('http://localhost:54324/api/v1/messages');
  const msgs = await req.json();
  const latest = msgs.messages[0];
  const msgReq = await fetch('http://localhost:54324/api/v1/message/' + latest.ID);
  const msgBody = await msgReq.json();
  const html = msgBody.HTML;
  const link = html.match(/href="([^"]+)">Sign In<\/a>/)[1];

  // Follow magic link
  await page.goto(link);
  
  // 2. Go to My Booth
  await page.goto('http://localhost:3001/my-booth');
  await page.waitForTimeout(2000);
  
  // Create a new product to ensure we have something we own
  await page.goto('http://localhost:3001/my-booth/products/new');
  await page.fill('input[placeholder="e.g. Heirloom Tomatoes"]', 'Screenshot Tomatoes');
  await page.fill('input[type="number"]', '5.00');
  await page.fill('input[placeholder="e.g. lbs, bunch, unit"]', 'lbs');
  await page.click('button:has-text("Save Product")');
  await page.waitForTimeout(1000);

  // Go to product detail page of Screenshot Tomatoes
  await page.goto('http://localhost:3001/my-booth');
  await page.click('text=Screenshot Tomatoes');
  await page.waitForTimeout(1000);

  // Take Share button screenshot
  await page.screenshot({ path: '/tmp/share_btn.png' });

  // Now, to test the Pre-flight modal, we need an expired product.
  // We can just use Supabase JS inside the browser page context to update the DB directly!
  await page.evaluate(async () => {
     // use fetch to hit our own postgres API if needed, 
     // or just we can let the agent do it. 
  });
});
