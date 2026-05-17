import { chromium, devices } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3001';
const MAILPIT_URL = 'http://127.0.0.1:54324';
const OUT_DIR = path.join(__dirname, '../../expo-market/store-assets');

const TARGETS = [
  { name: 'phone', device: devices['iPhone 14 Pro'], width: 1080, height: 1920, scale: 2.7 },
  { name: 'tablet7', device: devices['iPad Mini'], width: 1200, height: 1920, scale: 1.5 },
  { name: 'tablet10', device: devices['iPad Pro 11'], width: 1600, height: 2560, scale: 1.5 },
  { name: 'chromebook', width: 1920, height: 1080, isMobile: false },
  { name: 'xr', width: 1920, height: 1080, isMobile: false }
];

async function clearMailpit() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

async function getOtpFromMailpit(email: string): Promise<string> {
  // Wait a few seconds for the email to arrive
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

async function capture() {
  console.log('Starting screenshot capture...');
  const browser = await chromium.launch({ headless: true });
  
  for (const target of TARGETS) {
    console.log(`\nCapturing for ${target.name}...`);
    const targetDir = path.join(OUT_DIR, target.name);
    fs.mkdirSync(targetDir, { recursive: true });

    let contextOptions: any = {
      geolocation: { latitude: 37.3362, longitude: -121.8906 }, // San Jose, CA
      permissions: ['geolocation', 'notifications']
    };
    if (target.device) {
      contextOptions = { ...contextOptions, ...target.device };
    } else {
      contextOptions = {
        ...contextOptions,
        viewport: { width: target.width, height: target.height },
        isMobile: target.isMobile
      };
    }
    
    const context = await browser.newContext(contextOptions);
    await context.addInitScript(() => {
      try {
        localStorage.setItem('casagrown_alpha_ack', 'true');
        localStorage.setItem('casagrown_notif_opted_out', 'true');
      } catch {}
    });

    const page = await context.newPage();

    try {
      // 0. Real UI Login with Mailpit OTP
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
      await page.waitForSelector('#otp', { timeout: 30000 }); // Wait for OTP fields
      
      console.log('Fetching OTP from Mailpit...');
      const otp = await getOtpFromMailpit(testEmail);
      console.log(`Received OTP: ${otp}`);
      
      const otpInput = page.locator('#otp').first();
      await otpInput.pressSequentially(otp);
      
      try {
        await page.getByRole('button', { name: /verify/i }).click({ timeout: 5000 });
      } catch(e) {
        // Auto-submit might have occurred
      }
      
      // Wait for login redirect to complete
      await page.waitForURL('**/market**', { timeout: 30000 });
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
        await page.waitForTimeout(1000); // Wait for animation
      } catch (e) {
        console.log('Could not close pioneer banner');
      }

      await page.screenshot({ path: path.join(targetDir, '01_market.png') });

      // 2. GrowBot
      console.log('Navigating to GrowBot...');
      await page.goto(`${BASE_URL}/growbot`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      try {
        await page.fill('textarea, input[placeholder*="message"], input[placeholder*="Chat"]', 'How often should I water my heirloom tomatoes?');
        await page.click('button[type="submit"], button:has-text("Send")');
        await page.waitForTimeout(4000);
      } catch (e) {
        console.log('Could not pre-fill GrowBot message');
      }
      await page.screenshot({ path: path.join(targetDir, '02_growbot.png') });

      // 3. Community
      console.log('Navigating to Community...');
      await page.goto(`${BASE_URL}/community`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(targetDir, '03_community.png') });

      // 4. Messages (DM)
      console.log('Navigating to Messages...');
      await page.goto(`${BASE_URL}/messages/fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(targetDir, '04_messages.png') });

      // 5. Earnings & Activity
      console.log('Navigating to Earnings...');
      await page.goto(`${BASE_URL}/earnings`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(targetDir, '05_earnings.png') });

      // 6. Orders
      console.log('Navigating to Orders...');
      await page.goto(`${BASE_URL}/orders`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(3000);
      try {
        await page.click('button:has-text("Completed")');
        await page.waitForTimeout(2000);
      } catch (e) {
        console.log('Could not click Completed tab');
      }
      await page.screenshot({ path: path.join(targetDir, '06_orders.png') });
      
      // 7. Product Listing with AI Button
      console.log('Navigating to Product Listing...');
      await page.goto(`${BASE_URL}/my-booth/products/new`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForTimeout(4000);
      try {
        await page.setInputFiles('input[type="file"]', '/tmp/tomato.jpg');
        await page.waitForTimeout(2000);
      } catch (e) {
        console.log('Could not set photo');
      }
      // Pre-fill name so AI button activates
      try {
        await page.fill('input[placeholder*="e.g. Heritage Tomatoes"]', 'Fresh Organic Heirloom Tomatoes');
        await page.waitForTimeout(1000);
      } catch (e) {
        console.log('Could not pre-fill product name');
      }
      await page.screenshot({ path: path.join(targetDir, '07_product_ai.png') });

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
