const { chromium } = require('playwright');
const path = require('path');

async function run() {
  console.log("Launching headless browser via Playwright...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const htmlPath = "/Users/rkhona/.gemini/antigravity/brain/d5611fbe-a293-4d43-9827-bcb60a9ae72f/scratch/report.html";
  console.log(`Loading HTML file from: ${htmlPath}`);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  
  const pdfPath = "/Users/rkhona/.gemini/antigravity/brain/d5611fbe-a293-4d43-9827-bcb60a9ae72f/Lead_and_Listing_Creation_Analytics_Report.pdf";
  console.log(`Generating A4 PDF at: ${pdfPath}`);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "15mm",
      bottom: "15mm",
      left: "15mm",
      right: "15mm"
    }
  });
  
  console.log("PDF created successfully!");
  await browser.close();
}

run().catch(console.error);
