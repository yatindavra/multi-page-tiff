import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cjs = require('./index.js');

export const imagesToTiff = cjs.imagesToTiff;
export const imagesToTiffBuffer = cjs.imagesToTiffBuffer;
export const joinTiffBuffers = cjs.joinTiffBuffers;
export default cjs;
