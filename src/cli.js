#!/usr/bin/env node

const { imagesToTiff } = require('./index');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  multi-page-tiff - Combine multiple images into a single multi-page TIFF

  Usage:
    multi-page-tiff <image1> <image2> [image3 ...] [options]

  Inputs: JPEG, PNG, or TIFF. JPEGs and TIFFs pass through without
  re-encoding; PNGs are converted to JPEG (quality 90) then wrapped.

  Options:
    -o, --output <path>        Output file path (default: output.tiff)
    -h, --help                 Show this help message
    -v, --version              Show version

  Examples:
    multi-page-tiff front.jpg back.jpg
    multi-page-tiff scan1.jpg scan2.jpg scan3.jpg -o combined.tiff
  `);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

// Parse arguments
let output = 'output.tiff';
const images = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--output') {
    output = args[++i];
  } else {
    images.push(args[i]);
  }
}

if (images.length < 2) {
  console.error('Error: At least 2 images are required.');
  process.exit(1);
}

imagesToTiff(images, output)
  .then(() => {
    console.log(`Created ${output} (${images.length} pages)`);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
