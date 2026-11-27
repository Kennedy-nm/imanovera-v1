import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {signPlan} from '@/lib/media';

export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  console.log('Open video', id, 'signed-in user:', auth.user?.id ?? 'NONE');

  const {data, error} = await supabase.from('episodes').select('id,title,plan').eq('id', id).maybeSingle();
  if (error) {
    console.error('Open video failed:', error.code, error.message);
    return NextResponse.json({error: 'Video not found. (database error)'}, {status: 404});
  }
  if (!data) {
    console.error('Open video: no row found for this id and user');
    return NextResponse.json({error: 'Video not found. (no matching row)'}, {status: 404});
  }
  const plan = await signPlan(supabase, data.plan as Record<string, unknown>);
  return NextResponse.json({episode: {id: data.id, title: data.title, plan}});
}