import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const [, , propsFile, outFile] = process.argv;
const inputProps = JSON.parse(readFileSync(propsFile, 'utf8'));

let lastBundle = -1;
console.log('Step 1: bundling the video code');
const serveUrl = await bundle({
  entryPoint: path.resolve('src/remotion/index.ts'),
  onProgress: (p) => {
    const step = Math.floor(p / 20) * 20;
    if (step !== lastBundle) {
      lastBundle = step;
      console.log(`  bundling ${step}%`);
    }
  },
});

console.log('Step 2: reading the composition');
const composition = await selectComposition({serveUrl, id: 'FromPlan', inputProps, logLevel: 'verbose'});
console.log(`  composition ready: ${composition.durationInFrames} frames`);

console.log('Step 3: rendering');
let lastRender = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: outFile,
  inputProps,
  logLevel: 'verbose',
  onProgress: ({progress}) => {
    const pct = Math.floor(progress * 10) * 10;
    if (pct !== lastRender) {
      lastRender = pct;
      console.log(`  rendering ${pct}%`);
    }
  },
});
console.log('Render finished');