import type {SupabaseClient} from '@supabase/supabase-js';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAdminClient} from '@/lib/supabase/admin';
import {signPaths} from '@/lib/media';

type QueueState = {running: boolean; started: boolean};
const g = globalThis as unknown as {__renderQueue?: QueueState};
const state: QueueState = (g.__renderQueue ??= {running: false, started: false});

type Job = {id: string; owner_id: string; plan: {scenes: {audioPath?: string; imagePath?: string}[]} & Record<string, unknown>};

class UserFacingError extends Error {}

function runRender(propsFile: string, outFile: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'render.mjs'), propsFile, outFile], {
      cwd: process.cwd(),
    });
    let log = '';
    let pending = '';
    child.stdout.on('data', (d) => {
      const text = String(d);
      log += text;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const m = /^PROGRESS (\d+)/.exec(line.trim());
        if (m) onProgress(Number(m[1]));
        else if (line.trim()) console.log(line);
      }
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

async function runJob(admin: SupabaseClient, job: Job) {
  let tmp: string | null = null;
  try {
    const scenes = job.plan.scenes;
    const wanted = scenes.flatMap((s) => [s.audioPath, s.imagePath]).filter((p): p is string => Boolean(p));
    const urls = await signPaths(admin, wanted, 7200);
    if (wanted.some((p) => !urls.has(p))) {
      throw new UserFacingError('Some pictures or narration for this video are no longer available.');
    }
    const plan = {
      ...job.plan,
      scenes: scenes.map((s) => ({
        ...s,
        audioUrl: s.audioPath ? urls.get(s.audioPath) : undefined,
        imageUrl: s.imagePath ? urls.get(s.imagePath) : undefined,
      })),
    };

    tmp = await mkdtemp(path.join(os.tmpdir(), 'imanovera-'));
    const propsFile = path.join(tmp, 'props.json');
    const outFile = path.join(tmp, 'out.mp4');
    await writeFile(propsFile, JSON.stringify({plan}));

    let lastPct = 0;
    let lastAt = 0;
    const saveProgress = async (pct: number) => {
      await admin.from('render_jobs').update({progress: pct}).eq('id', job.id);
    };
    await runRender(propsFile, outFile, (pct) => {
      const now = Date.now();
      if (pct > lastPct && now - lastAt > 2000) {
        lastPct = pct;
        lastAt = now;
        void saveProgress(pct);
      }
    });

    const bytes = await readFile(outFile);
    const outputPath = `${job.owner_id}/${job.id}.mp4`;
    const {error: uploadError} = await admin.storage
      .from('renders')
      .upload(outputPath, bytes, {contentType: 'video/mp4', upsert: true});
    if (uploadError) throw uploadError;

    await admin
      .from('render_jobs')
      .update({status: 'done', progress: 100, output_path: outputPath, finished_at: new Date().toISOString()})
      .eq('id', job.id);
  } catch (e) {
    console.error(e);
    await admin
      .from('render_jobs')
      .update({
        status: 'failed',
        error: e instanceof UserFacingError ? e.message : 'Could not export the video. Please try again.',
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  } finally {
    if (tmp) await rm(tmp, {recursive: true, force: true});
  }
}

// Safe to call at any time: if a worker loop is already running, this does nothing.
export async function processQueue() {
  if (state.running) return;
  state.running = true;
  try {
    const admin = createAdminClient();

    // After a server restart, any job still marked "rendering" was interrupted.
    if (!state.started) {
      state.started = true;
      await admin
        .from('render_jobs')
        .update({
          status: 'failed',
          error: 'The export was interrupted. Please try again.',
          finished_at: new Date().toISOString(),
        })
        .eq('status', 'rendering');
    }

    while (true) {
      const {data: next} = await admin
        .from('render_jobs')
        .select('id,owner_id,plan')
        .eq('status', 'queued')
        .order('created_at', {ascending: true})
        .limit(1)
        .maybeSingle();
      if (!next) break;

      const {data: claimed} = await admin
        .from('render_jobs')
        .update({status: 'rendering', progress: 0, started_at: new Date().toISOString()})
        .eq('id', next.id)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();
      if (!claimed) continue;

      await runJob(admin, next as Job);
    }
  } catch (e) {
    console.error('Render queue error:', e);
  } finally {
    state.running = false;
  }
}