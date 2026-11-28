// 6b page.tsx
'use client';
import {useCallback, useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Player} from '@remotion/player';
import {createClient} from '@/lib/supabase/client';
import {VideoFromPlan} from '@/remotion/VideoFromPlan';
import {planDurationInFrames, type Plan, type Scene} from '@/remotion/plan';

type VoiceResult = {id: string; audioPath: string; audioUrl: string; audioSec: number};
type ImageResult = {id: string; imagePath: string; imageUrl: string};
type EpisodeRow = {id: string; title: string; updated_at: string};
type JobStatus = 'queued' | 'rendering' | 'done' | 'failed';
type ExportState = {status: JobStatus; progress: number};
type ExportPoll = ExportState & {error?: string | null; videoUrl?: string};

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

async function callApi<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body === undefined
      ? undefined
      : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)},
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data as T;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'explain' | 'product'>('explain');
  const [idea, setIdea] = useState('');
  const [audience, setAudience] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ExportState | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');

  const exporting = starting || job?.status === 'queued' || job?.status === 'rendering';
  const busy = loading || voicing || imaging || exporting;

  const refreshList = useCallback(async () => {
    try {
      const d = await callApi<{episodes: EpisodeRow[]}>('/api/episodes');
      setEpisodes(d.episodes);
    } catch {
      // The list is a convenience; ignore failures here.
    }
  }, []);

  useEffect(() => {
    void refreshList();
    // If an export is still running (for example after a page reload), pick it up again.
    void (async () => {
      try {
        const d = await callApi<{job: {id: string; status: JobStatus; progress: number} | null}>('/api/export');
        if (d.job) {
          setJobId(d.job.id);
          setJob({status: d.job.status, progress: d.job.progress});
        }
      } catch {
        // Nothing to resume.
      }
    })();
  }, [refreshList]);

  // Check on the export every two seconds until it finishes.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const s = await callApi<ExportPoll>(`/api/export/${jobId}`);
        if (cancelled) return;
        fails = 0;
        setJob({status: s.status, progress: s.progress});
        if (s.status === 'done') {
          setVideoUrl(s.videoUrl ?? '');
          return;
        }
        if (s.status === 'failed') {
          setError(s.error || 'Could not export the video. Please try again.');
          return;
        }
      } catch {
        fails += 1;
        if (fails >= 5) return;
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function updateScene(id: string, patch: Partial<Scene>) {
    setPlan((p) => (p ? {...p, scenes: p.scenes.map((x) => (x.id === id ? {...x, ...patch} : x))} : p));
  }

  async function saveEpisode(p: Plan, id: string | null): Promise<string | null> {
    try {
      const d = await callApi<{id: string}>('/api/episodes', {id: id ?? undefined, title: p.title, plan: p});
      setEpisodeId(d.id);
      void refreshList();
      return d.id;
    } catch (e) {
      setError('Your video could not be saved: ' + message(e));
      return id;
    }
  }

  async function create() {
    setLoading(true);
    setError('');
    setPlan(null);
    setEpisodeId(null);
    setVideoUrl('');
    try {
      const data = await callApi<{plan: Plan}>('/api/plan', {idea, audience: audience || undefined});
      setPlan(data.plan);
      await saveEpisode(data.plan, null);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  function chooseFiles(list: FileList | null) {
    setError('');
    let chosen = Array.from(list ?? []);
    if (chosen.length > MAX_PHOTOS) {
      setError(`Please choose up to ${MAX_PHOTOS} photos. I kept the first ${MAX_PHOTOS}.`);
      chosen = chosen.slice(0, MAX_PHOTOS);
    }
    const tooBig = chosen.find((f) => f.size > MAX_PHOTO_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than 8 MB. Please choose a smaller photo.`);
      return;
    }
    setFiles(chosen);
  }

  async function createProduct() {
    setLoading(true);
    setError('');
    setPlan(null);
    setEpisodeId(null);
    setVideoUrl('');
    try {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setStage(`Uploading photo ${i + 1} of ${files.length}…`);
        const form = new FormData();
        form.append('file', files[i]);
        const res = await fetch('/api/upload', {method: 'POST', body: form});
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not upload a photo.');
        paths.push(data.path as string);
      }
      setStage('Looking at your photos and planning your video…');
      const data = await callApi<{plan: Plan}>('/api/plan/product', {description, photos: paths});
      setPlan(data.plan);
      await saveEpisode(data.plan, null);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
      setStage('');
    }
  }

  async function openEpisode(id: string) {
    setError('');
    setVideoUrl('');
    try {
      const d = await callApi<{episode: {id: string; title: string; plan: Plan}}>(`/api/episodes/${id}`);
      setPlan(d.episode.plan);
      setEpisodeId(d.episode.id);
    } catch (e) {
      setError(message(e));
    }
  }

  async function addVoice() {
    if (!plan) return;
    const todo = plan.scenes.filter((s) => !s.audioPath);
    if (todo.length === 0) {
      setError('Every scene already has narration. Edit a scene\'s text if you want to record it again.');
      return;
    }
    setVoicing(true);
    setError('');
    try {
      const data = await callApi<{scenes: VoiceResult[]}>('/api/voice', {
        scenes: todo.map((s) => ({id: s.id, narration: s.narration})),
      });
      const byId = new Map(data.scenes.map((s) => [s.id, s] as const));
      const next: Plan = {
        ...plan,
        scenes: plan.scenes.map((s) => {
          const a = byId.get(s.id);
          return a
            ? {
                ...s,
                audioPath: a.audioPath,
                audioUrl: a.audioUrl,
                durationSec: Math.ceil((a.audioSec + 0.8) * 10) / 10,
              }
            : s;
        }),
      };
      setPlan(next);
      await saveEpisode(next, episodeId);
    } catch (e) {
      setError(message(e));
    } finally {
      setVoicing(false);
    }
  }

  async function addImages() {
    if (!plan) return;
    const todo = plan.scenes.filter((s) => !s.imagePath && !(s.layers && s.layers.length > 0));
    if (todo.length === 0) {
      setError('Every scene already has a picture.');
      return;
    }
    setImaging(true);
    setError('');
    try {
      const data = await callApi<{scenes: ImageResult[]; failed: {id: string; reason: string}[]}>('/api/images', {
        scenes: todo.map((s) => ({id: s.id, visualIdea: s.visualIdea})),
      });
      const byId = new Map(data.scenes.map((s) => [s.id, s] as const));
      const next: Plan = {
        ...plan,
        scenes: plan.scenes.map((s) => {
          const a = byId.get(s.id);
          return a ? {...s, imagePath: a.imagePath, imageUrl: a.imageUrl} : s;
        }),
      };
      setPlan(next);
      await saveEpisode(next, episodeId);
      if (data.failed.length > 0) {
        const names = data.failed.map((f) => `Scene ${plan.scenes.findIndex((s) => s.id === f.id) + 1}`).join(', ');
        setError(
          `${names}: the picture was declined by the safety filter. Change that scene's picture idea below and press "Add pictures" again.`,
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setImaging(false);
    }
  }

  async function exportVideo() {
    if (!plan) return;
    setStarting(true);
    setError('');
    setVideoUrl('');
    try {
      const data = await callApi<{jobId: string}>('/api/export', {plan});
      setJob({status: 'queued', progress: 0});
      setJobId(data.jobId);
    } catch (e) {
      setError(message(e));
    } finally {
      setStarting(false);
    }
  }

  async function downloadVideo() {
    if (!jobId) return;
    setError('');
    try {
      const s = await callApi<ExportPoll>(`/api/export/${jobId}`);
      if (!s.videoUrl) throw new Error('The video is not ready yet.');
      window.location.href = s.videoUrl;
    } catch (e) {
      setError(message(e));
    }
  }

  const isProductVideo = plan?.starter === 'business';

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Imanovera</h1>
      <button className="text-sm text-gray-600 underline" onClick={signOut}>
        Sign out
      </button>
      <p className="mt-1 text-gray-600">Tell me your video idea and I will plan it with you.</p>

      {episodes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">My videos</h2>
          <ul className="mt-2 space-y-1">
            {episodes.map((ep) => (
              <li key={ep.id}>
                <button
                  className={`underline ${ep.id === episodeId ? 'font-semibold text-blue-800' : 'text-blue-700'}`}
                  onClick={() => openEpisode(ep.id)}
                >
                  {ep.title}
                </button>
                <span className="ml-2 text-sm text-gray-500">{new Date(ep.updated_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex gap-2">
        <button
          className={`rounded px-4 py-2 font-semibold ${mode === 'explain' ? 'bg-blue-600 text-white' : 'border'}`}
          disabled={busy}
          onClick={() => setMode('explain')}
        >
          Explain an idea
        </button>
        <button
          className={`rounded px-4 py-2 font-semibold ${mode === 'product' ? 'bg-blue-600 text-white' : 'border'}`}
          disabled={busy}
          onClick={() => setMode('product')}
        >
          Promote my product
        </button>
      </div>

      {mode === 'explain' ? (
        <>
          <textarea
            className="mt-4 w-full rounded border p-3"
            rows={4}
            placeholder="Example: Explain where rain comes from"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
          <input
            className="mt-3 w-full rounded border p-3"
            placeholder="Who is it for? Example: 10-year-old students"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />
          <button
            className="mt-4 rounded bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={busy || idea.trim().length < 10}
            onClick={create}
          >
            {loading ? 'Planning your video…' : 'Create my plan'}
          </button>
        </>
      ) : (
        <>
          <textarea
            className="mt-4 w-full rounded border p-3"
            rows={4}
            maxLength={1000}
            placeholder="Describe your business and what you sell. Example: Handmade leather bags made in Nairobi. Free delivery within the city."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="mt-3 block text-sm text-gray-700">
            Choose 1 to {MAX_PHOTOS} photos of your products (JPG, PNG or WebP, up to 8 MB each). Only upload photos
            you own or have permission to use.
            <input
              className="mt-1 block w-full"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => chooseFiles(e.target.files)}
            />
          </label>
          {files.length > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {files.length} photo{files.length === 1 ? '' : 's'} selected: {files.map((f) => f.name).join(', ')}
            </p>
          )}
          <button
            className="mt-4 rounded bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={busy || description.trim().length < 10 || files.length === 0}
            onClick={createProduct}
          >
            {loading ? stage || 'Planning your video…' : 'Create my product video'}
          </button>
        </>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {exporting && (
        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded bg-gray-200">
            <div className="h-3 bg-orange-600 transition-all" style={{width: `${job?.progress ?? 0}%`}} />
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {job?.status === 'rendering' ? `Exporting… ${job.progress}%` : 'Getting ready to export…'} You can close
            this page and come back; the export keeps going.
          </p>
        </div>
      )}

      {plan && (
        <section className="mt-8">
          <h2 className="text-2xl font-semibold">{plan.title}</h2>
          <Player
            component={VideoFromPlan}
            inputProps={{plan}}
            durationInFrames={planDurationInFrames(plan)}
            fps={plan.fps}
            compositionWidth={plan.width}
            compositionHeight={plan.height}
            controls
            acknowledgeRemotionLicense
            style={{width: '100%', marginTop: 16, borderRadius: 12}}
          />
          <button
            className="mt-3 rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={addVoice}
          >
            {voicing ? 'Recording narration…' : 'Add narration'}
          </button>
          {!isProductVideo && (
            <button
              className="ml-3 mt-3 rounded bg-purple-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={addImages}
            >
              {imaging ? 'Drawing pictures…' : 'Add pictures'}
            </button>
          )}
          <button
            className="ml-3 mt-3 rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={exportVideo}
          >
            {exporting ? 'Exporting…' : 'Export MP4'}
          </button>
          {videoUrl && (
            <p className="mt-3">
              <button className="font-semibold text-blue-700 underline" onClick={downloadVideo}>
                Download your video
              </button>
            </p>
          )}
          <ol className="mt-6 space-y-3">
            {plan.scenes.map((s, i) => {
              const photo = s.layers?.find((l) => l.type === 'image' && l.url);
              return (
                <li key={s.id} className="rounded border p-4">
                  <div className="flex gap-3">
                    {photo?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt="" className="h-20 w-28 flex-none rounded object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        Scene {i + 1} ({s.durationSec}s){s.audioPath ? '' : ' · no voice yet'}
                      </div>
                      <input
                        className="mt-1 w-full rounded border p-1 font-semibold"
                        value={s.title}
                        maxLength={80}
                        onChange={(e) => updateScene(s.id, {title: e.target.value})}
                        onBlur={() => void saveEpisode(plan, episodeId)}
                      />
                      <textarea
                        className="mt-1 w-full rounded border p-1 text-sm"
                        rows={3}
                        maxLength={500}
                        value={s.narration}
                        onChange={(e) => updateScene(s.id, {narration: e.target.value, audioPath: undefined, audioUrl: undefined})}
                        onBlur={() => void saveEpisode(plan, episodeId)}
                      />
                      {!photo && (
                        <input
                          className="mt-1 w-full rounded border p-1 text-sm text-gray-700"
                          value={s.visualIdea}
                          onChange={(e) =>
                            updateScene(s.id, {visualIdea: e.target.value, imagePath: undefined, imageUrl: undefined})
                          }
                          onBlur={() => void saveEpisode(plan, episodeId)}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </main>
  );
}