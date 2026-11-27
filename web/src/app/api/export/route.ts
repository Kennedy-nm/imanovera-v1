import {NextResponse} from 'next/server';
import {z} from 'zod';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {signPaths} from '@/lib/media';

const mediaPath = z.string().regex(/^[0-9a-f-]{36}\/(audio|images)\/[0-9a-f-]{36}\.(mp3|jpg)$/);
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
          audioPath: mediaPath.optional(),
          imagePath: mediaPath.optional(),
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
    child.stdout.on('data', (d) => {
      log += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      log += d;
      process.stderr.write(d);
    });
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

  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  rendering = true;
  try {
    const scenes = parsed.data.plan.scenes;
    const wanted = scenes.flatMap((s) => [s.audioPath, s.imagePath]).filter((p): p is string => Boolean(p));
    const urls = await signPaths(supabase, wanted, 3600);
    if (wanted.some((p) => !urls.has(p))) {
      return NextResponse.json({error: 'Some pictures or narration for this video are not available.'}, {status: 400});
    }

    const plan = {
      ...parsed.data.plan,
      scenes: scenes.map((s) => ({
        ...s,
        audioUrl: s.audioPath ? urls.get(s.audioPath) : undefined,
        imageUrl: s.imagePath ? urls.get(s.imagePath) : undefined,
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