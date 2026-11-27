import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import OpenAI, {toFile} from 'openai';

process.loadEnvFile('.env.local');

const openai = new OpenAI();
const MODEL = 'gpt-image-2.5-flare';
const OUT = path.join(process.cwd(), 'experiments');
mkdirSync(OUT, {recursive: true});

const CHARACTER_STYLE =
  'Friendly flat-colour children\'s cartoon style, simple shapes, bold clean outlines, bright colours. ' +
  'Full-body single character, centred, no background, no ground, no shadow, no text.';

const CHARACTER =
  'Mr. Kamau: a warm, smiling African male teacher in his forties, short black hair, round glasses, ' +
  'orange sweater over a white shirt, dark blue trousers, brown shoes.';

function save(name, b64) {
  const file = path.join(OUT, name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('  saved', file);
  return file;
}

function report(label, result, started) {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${label}: ${secs}s, usage:`, JSON.stringify(result.usage ?? 'not reported'));
}

async function step(label, fn) {
  console.log(`\n${label}`);
  try {
    return await fn();
  } catch (e) {
    console.log(`  FAILED: ${e?.status ?? ''} ${e?.code ?? ''} ${e?.message ?? e}`);
    return null;
  }
}

// 1. The character, on a transparent background
const base = await step('1. Creating the character (transparent background)', async () => {
  const t = Date.now();
  const r = await openai.images.generate({
    model: MODEL,
    prompt: `${CHARACTER_STYLE} Standing relaxed, facing the viewer, smiling. ${CHARACTER}`,
    size: '1024x1024',
    quality: 'medium',
    background: 'transparent',
    output_format: 'png',
  });
  report('character', r, t);
  return save('1-teacher-standing.png', r.data[0].b64_json);
});

// 2 and 3. The same character in new poses, using the first picture as the reference
const poses = [
  ['2-teacher-pointing.png', 'Now show this exact same character pointing with one hand toward the upper left, as if teaching at a board.'],
  ['3-teacher-coin.png', 'Now show this exact same character holding up a single large gold coin in one hand, looking happy.'],
];

const poseFiles = [];
if (base) {
  for (const [name, change] of poses) {
    const file = await step(`Creating pose: ${name}`, async () => {
      const t = Date.now();
      const r = await openai.images.edit({
        model: MODEL,
        image: await toFile(readFileSync(base), 'teacher.png', {type: 'image/png'}),
        prompt:
          `${change} Keep the same face, hair, glasses, clothes, colours, proportions and drawing style. ` +
          'Full body, no background, no ground, no shadow, no text.',
        size: '1024x1024',
        quality: 'medium',
        background: 'transparent',
        output_format: 'png',
      });
      report('pose', r, t);
      return save(name, r.data[0].b64_json);
    });
    if (file) poseFiles.push(file);
  }
} else {
  console.log('\nSkipping poses because step 1 failed. Send me the FAILED line above.');
}

// 4. A background with no characters
const bg = await step('4. Creating a background (no characters)', async () => {
  const t = Date.now();
  const r = await openai.images.generate({
    model: MODEL,
    prompt:
      'Friendly flat-colour children\'s cartoon style. A bright empty classroom with a green chalkboard, ' +
      'a wooden floor and a window with blue sky. No people, no characters, no text or letters.',
    size: '1536x864',
    quality: 'low',
    output_format: 'jpeg',
  });
  report('background', r, t);
  return save('4-classroom-background.jpg', r.data[0].b64_json);
});

// 5. Put the characters on the background (and on dark, to expose rough edges)
const characters = [base, ...poseFiles].filter(Boolean);
if (bg && characters.length > 0) {
  console.log('\n5. Putting the characters on the background');
  try {
    const {default: sharp} = await import('sharp');
    const bgImage = await sharp(bg).resize(1536, 864).toBuffer();
    const layers = [];
    for (const [i, file] of characters.entries()) {
      const meta = await sharp(file).metadata();
      console.log(`  ${path.basename(file)}: has transparency = ${meta.hasAlpha}`);
      const small = await sharp(file).resize({height: 560}).toBuffer();
      const w = (await sharp(small).metadata()).width ?? 400;
      layers.push({input: small, left: 60 + i * 480, top: 864 - 560 - 30});
      void w;
    }
    await sharp(bgImage).composite(layers).jpeg({quality: 85}).toFile(path.join(OUT, '5-on-background.jpg'));
    console.log('  saved', path.join(OUT, '5-on-background.jpg'));

    const dark = await sharp({create: {width: 1536, height: 864, channels: 3, background: '#222222'}})
      .composite(layers)
      .jpeg({quality: 85})
      .toFile(path.join(OUT, '6-on-dark-edge-check.jpg'));
    void dark;
    console.log('  saved', path.join(OUT, '6-on-dark-edge-check.jpg'));
  } catch (e) {
    console.log('  Could not combine pictures:', e?.message ?? e);
    console.log('  (You can still judge the separate pictures in the experiments folder.)');
  }
}

console.log('\nDone. Open the folder:', OUT);