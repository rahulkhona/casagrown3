const { createCanvas } = require('canvas');
const fs = require('fs');

const width = 1400;
const height = 400;

// Create canvas with transparent background
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Typography settings
ctx.fillStyle = '#1c5230'; // Dark green matching the logo
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
// Draw first line
ctx.font = 'normal 80px Georgia'; // Elegant serif
ctx.fillText("Fresh from your Neighbor's backyard", width / 2, height / 2 - 50);

// Draw second line
ctx.font = 'bold 64px Georgia'; // Bold serif for the URL to match the logo
ctx.fillText("casagrown.com", width / 2, height / 2 + 50);

// Save image
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/Users/rkhona/.gemini/antigravity/brain/ec9ff08e-3a5e-4e51-8b83-7218464dd561/back_tote_text_transparent_v4.png', buffer);
console.log('Image saved!');
