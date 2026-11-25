import {NextResponse} from 'next/server';
import {z} from 'zod';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const mediaUrl = z.string().regex(/^\/generated\/[A-Za-z0-9-]+\.(mp3|jpg)$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Input = z.object({
  plan: z.object({
    title: z.string().max(200),
    fps: z.literal(30),
    width: z.literal(1280),
    height: z.literal(720),
    scenes: z
      .array(
        z.object({
          id: z.string().max(40),
          title: z.string().max(200),
          narration: z.string().max(600),
          durationSec: z.number().min(1).max(60),
          visualIdea: z.string().max(400),
          background: hex,
          textColor: hex,
          audioUrl: mediaUrl.optional(),
          imageUrl: mediaUrl.optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
});

let rendering = false;

function runRender(propsFile: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'render.mjs'), propsFile, outFile], {
      cwd: process.cwd(),
    });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    const timer = setTimeout(() => child.kill(), 20 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Render failed (code ${code}): ${log.slice(-1500)}`));
    });
  });
}

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'The video plan is not valid.'}, {status: 400});
  }
  if (rendering) {
    return NextResponse.json({error: 'Another video is being exported. Please try again in a minute.'}, {status: 429});
  }

  rendering = true;
  try {
    const origin = new URL(req.url).origin;
    const plan = {
      ...parsed.data.plan,
      scenes: parsed.data.plan.scenes.map((s) => ({
        ...s,
        audioUrl: s.audioUrl ? origin + s.audioUrl : undefined,
        imageUrl: s.imageUrl ? origin + s.imageUrl : undefined,
      })),
    };

    const tmp = await mkdtemp(path.join(os.tmpdir(), 'imanovera-'));
    const propsFile = path.join(tmp, 'props.json');
    await writeFile(propsFile, JSON.stringify({plan}));

    const videosDir = path.join(process.cwd(), 'public', 'generated');
    await mkdir(videosDir, {recursive: true});
    const name = `${randomUUID()}.mp4`;
    await runRender(propsFile, path.join(videosDir, name));

    return NextResponse.json({videoUrl: `/generated/${name}`});
  } catch (e) {
    console.error(e);
    return NextResponse.json({error: 'Could not export the video right now. Please try again.'}, {status: 500});
  } finally {
    rendering = false;
  }
}