import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {signPlan} from '@/lib/media';

export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const supabase = await createClient();
  const {data, error} = await supabase.from('episodes').select('id,title,plan').eq('id', id).single();
  if (error || !data) {
    return NextResponse.json({error: 'Video not found.'}, {status: 404});
  }
  const plan = await signPlan(supabase, data.plan as Record<string, unknown>);
  return NextResponse.json({episode: {id: data.id, title: data.title, plan}});
}