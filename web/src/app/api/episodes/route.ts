import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {stripUrls} from '@/lib/media';

const Input = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  plan: z.record(z.string(), z.unknown()),
});

export async function GET() {
  const supabase = await createClient();
  const {data, error} = await supabase
    .from('episodes')
    .select('id,title,updated_at')
    .order('updated_at', {ascending: false})
    .limit(50);
  if (error) {
    console.error(error);
    return NextResponse.json({error: 'Could not load your videos.'}, {status: 500});
  }
  return NextResponse.json({episodes: data});
}

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success || JSON.stringify(parsed.data.plan).length > 200_000) {
    return NextResponse.json({error: 'The video could not be saved (invalid data).'}, {status: 400});
  }
  const {id, title} = parsed.data;
  const plan = stripUrls(parsed.data.plan);
  const supabase = await createClient();

  if (id) {
    const {data, error} = await supabase.from('episodes').update({title, plan}).eq('id', id).select('id').single();
    if (error || !data) {
      console.error(error);
      return NextResponse.json({error: 'Video not found.'}, {status: 404});
    }
    return NextResponse.json({id: data.id});
  }

  const {data, error} = await supabase.from('episodes').insert({title, plan}).select('id').single();
  if (error || !data) {
    console.error(error);
    return NextResponse.json({error: 'Could not save the video.'}, {status: 500});
  }
  return NextResponse.json({id: data.id});
}