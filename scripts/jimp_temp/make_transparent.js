const fs = require('fs');
const jpeg = require('jpeg-js');
const PNG = require('pngjs').PNG;

const jpegData = fs.readFileSync('/Users/rkhona/.gemini/antigravity/brain/ec9ff08e-3a5e-4e51-8b83-7218464dd561/tote_printer_artwork_1777135855129.png');
const rawImageData = jpeg.decode(jpegData, {useTArray: true}); // returns width, height, data

const png = new PNG({
  width: rawImageData.width,
  height: rawImageData.height,
  filterType: -1
});

// Copy data and add transparency
for (let i = 0; i < rawImageData.data.length; i += 4) {
  const r = rawImageData.data[i];
  const g = rawImageData.data[i + 1];
  const b = rawImageData.data[i + 2];
  
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  
  if (r > 230 && g > 230 && b > 230) {
    png.data[i + 3] = 0; // Transparent
  } else {
    png.data[i + 3] = 255; // Opaque
  }
}

png.pack().pipe(fs.createWriteStream('/Users/rkhona/.gemini/antigravity/brain/ec9ff08e-3a5e-4e51-8b83-7218464dd561/tote_printer_artwork_transparent.png'))
  .on('finish', () => {
    console.log('Successfully saved transparent PNG!');
  });
