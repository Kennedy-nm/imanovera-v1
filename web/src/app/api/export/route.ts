// 6a export route.ts
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {processQueue} from '@/lib/renderQueue';
import {collectPaths} from '@/lib/media';

const mediaPath = z.string().regex(/^[0-9a-f-]{36}\/(audio|images|photos)\/[0-9a-f-]{36}\.(mp3|jpg)$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const layer = z.object({
  id: z.string().max(40),
  type: z.literal('image'),
  fit: z.enum(['contain', 'cover']),
  path: mediaPath,
});

const Input = z.object({
  plan: z.object({
    title: z.string().max(200),
    fps: z.literal(30),
    width: z.literal(1280),
    height: z.literal(720),
    starter: z.enum(['explainer', 'business']).optional(),
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
          layers: z.array(layer).max(4).optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
});

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'The video plan is not valid.'}, {status: 400});
  }

  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  // Users may only export their own files.
  const paths = collectPaths(parsed.data.plan as Record<string, unknown>);
  if (paths.some((p) => !p.startsWith(`${user.id}/`))) {
    return NextResponse.json({error: 'Some media in this video is not available.'}, {status: 400});
  }

  // One export at a time per user.
  const {data: active} = await supabase
    .from('render_jobs')
    .select('id')
    .in('status', ['queued', 'rendering'])
    .limit(1);
  if (active && active.length > 0) {
    return NextResponse.json({error: 'You already have an export in progress.'}, {status: 429});
  }

  const {data: job, error} = await supabase
    .from('render_jobs')
    .insert({plan: parsed.data.plan, status: 'queued', progress: 0})
    .select('id')
    .single();
  if (error || !job) {
    console.error(error);
    return NextResponse.json({error: 'Could not start the export. Please try again.'}, {status: 500});
  }

  void processQueue();
  return NextResponse.json({jobId: job.id});
}

export async function GET() {
  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  const {data} = await supabase
    .from('render_jobs')
    .select('id,status,progress')
    .in('status', ['queued', 'rendering'])
    .order('created_at', {ascending: false})
    .limit(1);
  return NextResponse.json({job: data?.[0] ?? null});
}