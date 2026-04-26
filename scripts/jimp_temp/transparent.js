const Jimp = require('jimp');

async function makeTransparent() {
  const image = await Jimp.read('/Users/rkhona/.gemini/antigravity/brain/ec9ff08e-3a5e-4e51-8b83-7218464dd561/tote_printer_artwork_1777135855129.png');
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const red = this.bitmap.data[idx + 0];
    const green = this.bitmap.data[idx + 1];
    const blue = this.bitmap.data[idx + 2];
    
    // If pixel is very close to white, make it transparent
    if (red > 240 && green > 240 && blue > 240) {
      this.bitmap.data[idx + 3] = 0; // alpha
    }
  });

  await image.writeAsync('/Users/rkhona/.gemini/antigravity/brain/ec9ff08e-3a5e-4e51-8b83-7218464dd561/tote_printer_artwork_transparent.png');
  console.log('Done!');
}

makeTransparent().catch(console.error);
