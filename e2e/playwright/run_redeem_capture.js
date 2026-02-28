const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:3000');
  
  await page.evaluate(() => {
     window.localStorage.setItem('E2E_BYPASS_AUTH', 'true')
  });
  
  await page.goto('http://localhost:3000/redeem');
  await page.waitForTimeout(2000); 
  
  await page.screenshot({ path: path.join(__dirname, 'redeem_fixed_render.png') });
  await browser.close();
})();
