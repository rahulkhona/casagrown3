import { chromium, devices } from 'playwright';
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3001';
const MAILPIT_URL = 'http://127.0.0.1:54324';
const OUT_DIR = path.join(__dirname, '../../expo-market/store-assets');

// Emulate actual mobile configurations to avoid responsive layout issues.
// Playwright handles scaling using viewport + deviceScaleFactor to get output dimensions.
const TARGETS = [
  {
    name: 'iphone65', // iPhone 6.5" Display (Needs 1242x2688 or 1284x2778)
    viewport: { width: 428, height: 926 }, // iPhone 13/14 Pro Max CSS size
    deviceScaleFactor: 3.0, // 428 * 3 = 1284, 926 * 3 = 2778. Exact match!
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  },
  {
    name: 'ipad129', // iPad Pro 12.9" Display (Needs 2048x2732 or 2732x2048)
    viewport: { width: 1024, height: 1366 }, // iPad Pro 12.9 CSS size
    deviceScaleFactor: 2.0, // 1024 * 2 = 2048, 1366 * 2 = 2732. Exact match!
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  }
];

async function clearMailpit() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

async function getOtpFromMailpit(email: string): Promise<string> {
  let data;
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    data = await res.json();
    if (data.messages && data.messages.length > 0) break;
  }
  if (!data || !data.messages) return '123456';

  for (const msg of data.messages.reverse()) {
    if (msg.To[0].Address === email) {
      const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`);
      const msgData = await msgRes.json();
      const text = msgData.Text;
      const match = text.match(/\b\d{6}\b/);
      if (match) return match[0];
    }
  }
  return '123456';
}

async function applyZoom(page: any, targetName: string) {
  if (targetName === 'ipad129') {
    const url = page.url();
    const isLayoutLocked = url.includes('/growbot') || url.includes('/messages') || url.includes('/community');
    const zoomVal = '1.25';
    await page.evaluate((zoom: string) => {
      document.documentElement.style.setProperty('zoom', zoom, 'important');
      const styleId = 'playwright-zoom-style';
      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.innerHTML = `
        html, body {
          zoom: ${zoom} !important;
        }
      `;
    }, zoomVal);
    await page.waitForTimeout(500);
  }
  // Scroll the window to top before taking screenshots to prevent scrollIntoView programmatic scroll issues
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.body) document.body.scrollTop = 0;
    if (document.documentElement) document.documentElement.scrollTop = 0;
  });
  await page.waitForTimeout(200);
}

async function capture() {
  console.log('Starting screenshot capture...');
  const browser = await chromium.launch({ headless: true });
  
  for (const target of TARGETS) {
    console.log(`\nCapturing for ${target.name}...`);
    const targetDir = path.join(OUT_DIR, target.name);
    fs.mkdirSync(targetDir, { recursive: true });
    const deleteTargetDir = path.join(__dirname, '../../../docs/delete_account_screenshots', target.name);
    fs.mkdirSync(deleteTargetDir, { recursive: true });

    const contextOptions = {
      viewport: target.viewport,
      deviceScaleFactor: target.deviceScaleFactor,
      isMobile: target.isMobile,
      hasTouch: target.hasTouch,
      userAgent: target.userAgent,
      geolocation: { latitude: 37.3362, longitude: -121.8906 },
      permissions: ['geolocation', 'notifications']
    };
    
    const context = await browser.newContext(contextOptions);
    await context.addInitScript(`
      try {
        localStorage.setItem('casagrown_alpha_ack', 'true');
        localStorage.setItem('casagrown_notif_opted_out', 'true');
      } catch {}

      if ('${target.name}' === 'ipad129') {
        const checkAndApply = () => {
          if (!document.documentElement) return;
          const path = window.location.pathname;
          const isLayoutLocked = path.includes('/growbot') || path.includes('/messages') || path.includes('/community');
          const zoomVal = '1.25';
          document.documentElement.style.setProperty('zoom', zoomVal, 'important');
          
          if (!document.head) return;
          let style = document.getElementById('playwright-zoom-style');
          if (!style) {
            style = document.createElement('style');
            style.id = 'playwright-zoom-style';
            document.head.appendChild(style);
          }
          style.innerHTML = 'html, body { zoom: ' + zoomVal + ' !important; }';
        };
        checkAndApply();
        window.addEventListener('DOMContentLoaded', checkAndApply);
        window.addEventListener('popstate', checkAndApply);
      }
    `);

    const page = await context.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (msg.type() === 'error' || txt.toLowerCase().includes('error') || txt.includes('Redirect')) {
        console.log(`[PAGE LOG ${target.name}]`, txt);
      }
    });
    page.on('pageerror', err => console.error(`[PAGE ERROR ${target.name}]`, err.message));
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`[HTTP ERROR ${target.name}]`, response.status(), response.url());
      }
    });



    try {
      console.log('Clearing old emails...');
      await clearMailpit();
      
      console.log('Navigating to Login...');
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForSelector('#email', { timeout: 30000 });
      
      const testEmail = 'sarah.m@marketing.local';
      console.log(`Logging in as ${testEmail}...`);
      await page.fill('#email', testEmail);
      await page.click('button[type="submit"]');
      
      console.log('Waiting for OTP input...');
      await page.waitForSelector('#otp', { timeout: 30000 });
      
      console.log('Fetching OTP from Mailpit...');
      const otp = await getOtpFromMailpit(testEmail);
      console.log(`Received OTP: ${otp}`);
      
      const otpInput = page.locator('#otp').first();
      await otpInput.pressSequentially(otp);
      
      try {
        await page.getByRole('button', { name: /verify/i }).click({ timeout: 5000 });
      } catch(e) {}
      
      // Wait for login redirect to complete
      await page.waitForURL('**/{market,terms,profile-setup}**', { timeout: 30000 });
      if (page.url().includes('/terms')) {
        console.log('Redirected to Terms page. Accepting terms...');
        await page.click('#agree-terms');
        await page.click('#agree-privacy');
        await page.click('button:has-text("Accept")');
        await page.waitForURL('**/{market,profile-setup}**', { timeout: 30000 });
      }

      if (page.url().includes('/profile-setup')) {
        console.log('Redirected to Profile Setup. Completing onboarding...');
        // Pre-fill required fields
        await page.fill('#full-name', 'Sarah Marketing');
        await page.fill('#street', '1200 Willow St');
        await page.fill('#city', 'San Jose');
        await page.fill('#state', 'CA');
        await page.fill('#zip', '95125');
        await page.click('button:has-text("Continue"), button[type="submit"]');
        await page.waitForURL('**/market**', { timeout: 30000 });
      }
      console.log('Login successful!');

      // 1. Marketplace Feed
      console.log('Navigating to Marketplace...');
      await page.goto(`${BASE_URL}/market?addr=San+Jose%2C+CA+95125&lat=37.3362&lng=-121.8906`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(6000);
      try {
        await page.evaluate(() => {
          const closeBtn = document.querySelector('button[aria-label="Dismiss"]') as HTMLElement || document.querySelector('.close-btn') as HTMLElement;
          if (closeBtn) closeBtn.click();
        });
        await page.waitForTimeout(1000);
      } catch (e) {}
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '01_market.png') });

      // 2. GrowBot
      console.log('Navigating to GrowBot...');
      await page.goto(`${BASE_URL}/growbot`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      try {
        await page.fill('textarea, input[placeholder*="message"], input[placeholder*="Chat"]', 'How often should I water my heirloom tomatoes?');
        await page.click('button[type="submit"], button:has-text("Send")');
        await page.waitForTimeout(4000);
      } catch (e) {}
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '02_growbot.png') });

      // 3. Community
      console.log('Navigating to Community...');
      await page.goto(`${BASE_URL}/community`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '03_community.png') });

      // 4. Messages (DM)
      console.log('Navigating to Messages...');
      await page.goto(`${BASE_URL}/messages/fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, { waitUntil: 'load', timeout: 90000 });
      console.log('Waiting for messages to render...');
      try {
        await page.waitForSelector('text="Hi David!"', { timeout: 20000 });
      } catch (err) {
        console.warn('Could not find text "Hi David!", waiting fallback timeout instead...');
        await page.waitForTimeout(5000);
      }
      await page.waitForTimeout(1000); // small buffer for final layout
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '04_messages.png') });

      // 5. Earnings & Activity
      console.log('Navigating to Earnings...');
      await page.goto(`${BASE_URL}/earnings`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '05_earnings.png') });

      // 6. Orders
      console.log('Navigating to Orders...');
      await page.goto(`${BASE_URL}/orders`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(3000);
      try {
        await page.click('button:has-text("Completed")');
        await page.waitForTimeout(2000);
      } catch (e) {}
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '06_orders.png') });
      
      // 7. Product Listing with AI Button
      console.log('Navigating to Product Listing...');
      await page.goto(`${BASE_URL}/my-booth/products/new`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      try {
        await page.fill('input[placeholder*="e.g. Heritage Tomatoes"]', 'Fresh Organic Heirloom Tomatoes');
        await page.waitForTimeout(1000);
      } catch (e) {}
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '07_product_ai.png') });

      // 8. Order Details Page (showing fulfillment, status, passcode)
      console.log('Navigating to Order Details...');
      await page.goto(`${BASE_URL}/orders/faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '08_order_details.png') });

      // 9. Messages Inbox (list of all conversations)
      console.log('Navigating to Messages Inbox...');
      await page.goto(`${BASE_URL}/messages`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(targetDir, '09_messages_inbox.png') });

      // 10. Grower's Booth details
      console.log('Fetching Sarah\'s booth ID...');
      let sarahBoothId = '';
      try {
        const pg = require('pg');
        const pgClient = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
        await pgClient.connect();
        const boothDbRes = await pgClient.query("SELECT id FROM market_booths WHERE owner_id = 'f1111111-1111-1111-1111-111111111111' LIMIT 1;");
        sarahBoothId = boothDbRes.rows[0]?.id || '';
        await pgClient.end();
      } catch (err) {
        console.error('Error fetching booth ID:', err);
      }
      
      if (sarahBoothId) {
        console.log(`Navigating to Grower's Booth details (ID: ${sarahBoothId})...`);
        await page.goto(`${BASE_URL}/market/booth/${sarahBoothId}`, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(4000);
        await applyZoom(page, target.name);
        await page.screenshot({ path: path.join(targetDir, '10_grower_booth.png') });
      } else {
        console.warn('Skipping 10_grower_booth.png due to missing booth ID');
      }

      // 8a. Delete Account (Standard Path - using Sarah who has transaction history)
      console.log('Navigating to Account Deletion flow for Standard Path (Sarah)...');
      await page.goto(`${BASE_URL}/delete-account`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await applyZoom(page, target.name);
      await page.screenshot({ path: path.join(deleteTargetDir, '08_delete_account_standard.png') });

      // 8b. Delete Account (Fast Path - Case A: using a brand new user with no transaction/social history)
      console.log('Navigating to Account Deletion flow for Fast Path (Case A)...');
      const fastPathContext = await browser.newContext(contextOptions);
      await fastPathContext.addInitScript(`
        try {
          localStorage.setItem('casagrown_alpha_ack', 'true');
          localStorage.setItem('casagrown_notif_opted_out', 'true');
        } catch {}

        if ('${target.name}' === 'ipad129') {
          const checkAndApply = () => {
            if (!document.documentElement) return;
            document.documentElement.style.setProperty('zoom', '1.25', 'important');
          };
          checkAndApply();
          window.addEventListener('DOMContentLoaded', checkAndApply);
        }
      `);

      const fastPathPage = await fastPathContext.newPage();
      try {
        console.log('Clearing emails for Fast Path login...');
        await clearMailpit();
        
        console.log('Navigating to Login for Fast Path...');
        await fastPathPage.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 90000 });
        await fastPathPage.waitForSelector('#email', { timeout: 30000 });
        
        const newEmail = `new.user.${Date.now()}_${target.name}@marketing.local`;
        console.log(`Logging in as ${newEmail}...`);
        await fastPathPage.fill('#email', newEmail);
        await fastPathPage.click('button[type="submit"]');
        
        console.log('Waiting for OTP input for Fast Path...');
        await fastPathPage.waitForSelector('#otp', { timeout: 30000 });
        
        console.log('Fetching OTP from Mailpit for Fast Path...');
        const otp = await getOtpFromMailpit(newEmail);
        console.log(`Received OTP for Fast Path: ${otp}`);
        
        const otpInput = fastPathPage.locator('#otp').first();
        await otpInput.pressSequentially(otp);
        
        try {
          await fastPathPage.getByRole('button', { name: /verify/i }).click({ timeout: 5000 });
        } catch(e) {}
        
        await fastPathPage.waitForURL('**/{market,terms,profile-setup}**', { timeout: 30000 });
        if (fastPathPage.url().includes('/terms')) {
          console.log('Agreeing to terms for Fast Path...');
          await fastPathPage.click('#agree-terms');
          await fastPathPage.click('#agree-privacy');
          await fastPathPage.click('button:has-text("Accept")');
          await fastPathPage.waitForURL('**/{market,profile-setup}**', { timeout: 30000 });
        }

        if (fastPathPage.url().includes('/profile-setup')) {
          console.log('Completing onboarding for Fast Path...');
          await fastPathPage.fill('#full-name', 'New User');
          await fastPathPage.fill('#street', '1204 Willow St');
          await fastPathPage.fill('#city', 'San Jose');
          await fastPathPage.fill('#state', 'CA');
          await fastPathPage.fill('#zip', '95125');
          await fastPathPage.click('button:has-text("Continue"), button[type="submit"]');
          await fastPathPage.waitForURL('**/market**', { timeout: 30000 });
        }

        console.log('Navigating Fast Path to delete-account page...');
        await fastPathPage.goto(`${BASE_URL}/delete-account`, { waitUntil: 'load', timeout: 90000 });
        await fastPathPage.waitForTimeout(4000);
        await applyZoom(fastPathPage, target.name);
        await fastPathPage.screenshot({ path: path.join(deleteTargetDir, '08_delete_account.png') });
        console.log('Fast Path screenshot captured successfully!');
      } catch (e) {
        console.error('Error capturing Fast Path screenshot:', e);
      } finally {
        await fastPathContext.close();
      }

      // 8c. Delete Account (Social Path - Case B: using Elena who has products/posts but no orders)
      console.log('Navigating to Account Deletion flow for Social Path (Case B)...');
      const socialPathContext = await browser.newContext(contextOptions);
      await socialPathContext.addInitScript(`
        try {
          localStorage.setItem('casagrown_alpha_ack', 'true');
          localStorage.setItem('casagrown_notif_opted_out', 'true');
        } catch {}

        if ('${target.name}' === 'ipad129') {
          const checkAndApply = () => {
            if (!document.documentElement) return;
            document.documentElement.style.setProperty('zoom', '1.25', 'important');
          };
          checkAndApply();
          window.addEventListener('DOMContentLoaded', checkAndApply);
        }
      `);

      const socialPathPage = await socialPathContext.newPage();
      try {
        console.log('Clearing emails for Social Path login...');
        await clearMailpit();
        
        console.log('Navigating to Login for Elena...');
        await socialPathPage.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 90000 });
        await socialPathPage.waitForSelector('#email', { timeout: 30000 });
        
        const elenaEmail = 'elena.r@marketing.local';
        console.log(`Logging in as ${elenaEmail}...`);
        await socialPathPage.fill('#email', elenaEmail);
        await socialPathPage.click('button[type="submit"]');
        
        console.log('Waiting for OTP input for Elena...');
        await socialPathPage.waitForSelector('#otp', { timeout: 30000 });
        
        console.log('Fetching OTP from Mailpit for Elena...');
        const otp = await getOtpFromMailpit(elenaEmail);
        console.log(`Received OTP for Elena: ${otp}`);
        
        const otpInput = socialPathPage.locator('#otp').first();
        await otpInput.pressSequentially(otp);
        
        try {
          await socialPathPage.getByRole('button', { name: /verify/i }).click({ timeout: 5000 });
        } catch(e) {}
        
        await socialPathPage.waitForURL('**/{market,terms,profile-setup}**', { timeout: 30000 });
        if (socialPathPage.url().includes('/terms')) {
          console.log('Agreeing to terms for Elena...');
          await socialPathPage.click('#agree-terms');
          await socialPathPage.click('#agree-privacy');
          await socialPathPage.click('button:has-text("Accept")');
          await socialPathPage.waitForURL('**/{market,profile-setup}**', { timeout: 30000 });
        }

        if (socialPathPage.url().includes('/profile-setup')) {
          console.log('Completing onboarding for Elena...');
          await socialPathPage.fill('#full-name', 'Elena Rodriguez');
          await socialPathPage.fill('#street', '1202 Willow St');
          await socialPathPage.fill('#city', 'San Jose');
          await socialPathPage.fill('#state', 'CA');
          await socialPathPage.fill('#zip', '95125');
          await socialPathPage.click('button:has-text("Continue"), button[type="submit"]');
          await socialPathPage.waitForURL('**/market**', { timeout: 30000 });
        }

        console.log('Navigating Elena to delete-account page...');
        await socialPathPage.goto(`${BASE_URL}/delete-account`, { waitUntil: 'load', timeout: 90000 });
        await socialPathPage.waitForTimeout(4000);
        await applyZoom(socialPathPage, target.name);
        await socialPathPage.screenshot({ path: path.join(deleteTargetDir, '08_delete_account_social.png') });
        console.log('Elena Social Path screenshot captured successfully!');
      } catch (e) {
        console.error('Error capturing Elena Social Path screenshot:', e);
      } finally {
        await socialPathContext.close();
      }

    } catch (e) {
      console.error(`Error capturing ${target.name}:`, e);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log('Finished capturing screenshots.');
}

capture().catch(console.error);
