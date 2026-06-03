const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const baseDir = '/Users/rkhona/development/quarantine_bot/casagrown3/apps/expo-market/store-assets';

async function checkDimensions() {
  const folders = ['phone', 'ipad129', 'iphone65'];
  for (const folder of folders) {
    const dir = path.join(baseDir, folder);
    if (!fs.existsSync(dir)) {
      console.log(`Directory does not exist: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
    console.log(`\nFolder: ${folder}`);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const image = await Jimp.read(filePath);
        console.log(`  - ${file}: ${image.width}x${image.height}`);
      } catch (err) {
        console.error(`  - Error reading ${file}: ${err.message}`);
      }
    }
  }
}

checkDimensions();
