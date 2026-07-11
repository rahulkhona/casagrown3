const fs = require('fs');
const files = [
  'app/(marketing)/sell/page.tsx',
  'app/(marketing)/join/page.tsx',
  'app/(marketing)/check-nutrition-loss/page.tsx',
  'app/(marketing)/sellers/page.tsx',
  'app/(main)/create-listing/page.tsx',
  'app/(main)/market/page.tsx',
  'app/(main)/community/ClientPage.tsx',
  'app/(main)/page.tsx',
  'app/components/MarketingTracker.tsx'
];

for (const file of files) {
  const path = require('path').join(__dirname, file);
  if (!fs.existsSync(path)) continue;
  let content = fs.readFileSync(path, 'utf8');
  
  // Remove the call
  content = content.replace(/^\s*useMarketingAnalytics\('[^']+'\);?\n/gm, '');
  content = content.replace(/^\s*useMarketingAnalytics\(slug\);?\n/gm, '');
  
  // Clean up the import
  content = content.replace(/\buseMarketingAnalytics,\s*/g, '');
  content = content.replace(/,\s*useMarketingAnalytics\b/g, '');
  content = content.replace(/import\s*{\s*useMarketingAnalytics\s*}\s*from\s*'[^']+'[;\n]*/g, '');
  
  // For MarketingTracker usage in create-listing
  content = content.replace(/^\s*<MarketingTracker[^>]*>\s*\n/gm, '');
  content = content.replace(/import\s*{\s*MarketingTracker\s*}\s*from\s*'.*MarketingTracker.*'[;\n]*/g, '');
  
  fs.writeFileSync(path, content, 'utf8');
  console.log('Processed', file);
}
