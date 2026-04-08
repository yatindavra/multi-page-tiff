# multi-page-tiff

Convert multiple images into a single multi-page TIFF file. Supports any image format that [sharp](https://sharp.pixelplumbing.com/) can read (JPEG, PNG, WebP, GIF, AVIF, SVG, etc.).

## Why?

There's no straightforward npm package to merge multiple images into a multi-page TIFF. This package fills that gap with a simple API and CLI.

## Install

```bash
npm install multi-page-tiff
```

## API Usage

```js
const { imagesToTiff, imagesToTiffBuffer } = require('multi-page-tiff');

// Write to file
await imagesToTiff(['front.jpg', 'back.jpg'], 'output.tiff');

// Get a Buffer (useful for uploading, streaming, etc.)
const buffer = await imagesToTiffBuffer(['scan1.png', 'scan2.png', 'scan3.png']);

// With compression
await imagesToTiff(['a.png', 'b.png'], 'output.tiff', { compression: 'lzw' });

// You can also pass Buffers instead of file paths
const buf1 = fs.readFileSync('page1.jpg');
const buf2 = fs.readFileSync('page2.jpg');
await imagesToTiff([buf1, buf2], 'output.tiff');
```

### `imagesToTiff(images, outputPath, [options])`

Converts multiple images and writes a multi-page TIFF file.

| Parameter | Type | Description |
|-----------|------|-------------|
| `images` | `(string \| Buffer)[]` | Array of file paths or image Buffers (minimum 2) |
| `outputPath` | `string` | Path for the output TIFF file |
| `options.compression` | `string` | `'none'` (default), `'lzw'`, `'deflate'`, or `'jpeg'` |

### `imagesToTiffBuffer(images, [options])`

Same as above but returns a `Buffer` instead of writing to disk.

### `joinTiffBuffers(buffers)`

Low-level utility: merges an array of single-page TIFF buffers into one multi-page TIFF buffer. Useful if you already have TIFF data and want to skip the sharp conversion step.

## CLI Usage

```bash
# Basic usage
multi-page-tiff front.jpg back.jpg

# Custom output path
multi-page-tiff scan1.png scan2.png scan3.png -o combined.tiff

# With compression
multi-page-tiff a.jpg b.jpg -c lzw -o output.tiff
```

### Options

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output file path (default: `output.tiff`) |
| `-c, --compression <type>` | Compression: `none`, `lzw`, `deflate`, `jpeg` |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Supported Compression

| Type | Description |
|------|-------------|
| `none` | No compression (largest file, fastest) |
| `lzw` | Lossless compression (good balance) |
| `deflate` | Lossless compression (smaller files) |
| `jpeg` | Lossy compression (smallest files) |

## License

MIT
