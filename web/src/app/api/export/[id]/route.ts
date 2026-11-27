import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {processQueue} from '@/lib/renderQueue';

export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  const {data: job} = await supabase
    .from('render_jobs')
    .select('id,status,progress,error,output_path')
    .eq('id', id)
    .maybeSingle();
  if (!job) return NextResponse.json({error: 'Export not found.'}, {status: 404});

  // If the server restarted while a job was waiting, this wakes the worker up.
  if (job.status === 'queued') void processQueue();

  let videoUrl: string | undefined;
  if (job.status === 'done' && job.output_path) {
    const {data} = await supabase.storage
      .from('renders')
      .createSignedUrl(job.output_path, 3600, {download: 'imanovera-video.mp4'});
    videoUrl = data?.signedUrl;
  }

  return NextResponse.json({status: job.status, progress: job.progress, error: job.error, videoUrl});
}