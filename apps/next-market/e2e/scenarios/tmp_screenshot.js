const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Create an auth state so we are logged in as Beth
  page.context().addCookies([{
    name: 'sb-localhost-auth-token',
    value: 'test',
    domain: 'localhost',
    path: '/',
  }]); // Wait, playwright login needs standard login.
  
  await browser.close();
})();
