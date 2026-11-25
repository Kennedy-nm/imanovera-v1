import OpenAI from 'openai';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const openai = new OpenAI();

const Input = z.object({
  scenes: z
    .array(z.object({id: z.string().max(40), narration: z.string().min(1).max(600)}))
    .min(1)
    .max(12),
});

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid narration text.'}, {status: 400});
  }

  try {
    const dir = path.join(process.cwd(), 'public', 'generated');
    await mkdir(dir, {recursive: true});
    const {parseBuffer} = await import('music-metadata');

    const scenes = await Promise.all(
      parsed.data.scenes.map(async (scene) => {
        const speech = await openai.audio.speech.create({
          model: 'gpt-4o-mini-tts',
          voice: 'alloy',
          input: scene.narration,
          instructions: 'Speak warmly and clearly, like a friendly teacher.',
          response_format: 'mp3',
        });
        const bytes = new Uint8Array(await speech.arrayBuffer());
        const meta = await parseBuffer(bytes, {mimeType: 'audio/mpeg'});
        const file = `${randomUUID()}.mp3`;
        await writeFile(path.join(dir, file), bytes);
        return {id: scene.id, audioUrl: `/generated/${file}`, audioSec: meta.format.duration ?? 5};
      }),
    );
    return NextResponse.json({scenes});
  } catch (e) {
    console.error(e);
    return NextResponse.json({error: 'Could not create the narration right now. Please try again.'}, {status: 500});
  }
}