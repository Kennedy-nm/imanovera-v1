import OpenAI from 'openai';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const openai = new OpenAI();

const Input = z.object({
  scenes: z
    .array(z.object({id: z.string().max(40), visualIdea: z.string().min(3).max(400)}))
    .min(1)
    .max(12),
});

const STYLE =
  'Friendly flat-colour educational cartoon illustration, simple shapes, bright clear colours, ' +
  'clean uncluttered composition, wide 16:9 scene, suitable for all ages. ' +
  'Do not include any text, letters, numbers or logos in the picture. Scene: ';

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid picture descriptions.'}, {status: 400});
  }

  try {
    const dir = path.join(process.cwd(), 'public', 'generated');
    await mkdir(dir, {recursive: true});

    const scenes = await Promise.all(
      parsed.data.scenes.map(async (scene) => {
        const result = await openai.images.generate({
          model: 'gpt-image-2.5-flare',
          prompt: STYLE + scene.visualIdea,
          size: '1536x864',
          quality: 'low',
          output_format: 'jpeg',
          output_compression: 80,
        });
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error('No image returned');
        const file = `${randomUUID()}.jpg`;
        await writeFile(path.join(dir, file), Buffer.from(b64, 'base64'));
        return {id: scene.id, imageUrl: `/generated/${file}`};
      }),
    );
    return NextResponse.json({scenes});
  } catch (e) {
    console.error(e);
    return NextResponse.json({error: 'Could not create the pictures right now. Please try again.'}, {status: 500});
  }
}