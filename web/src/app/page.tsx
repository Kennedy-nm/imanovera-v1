'use client';
import {useCallback, useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Player} from '@remotion/player';
import {createClient} from '@/lib/supabase/client';
import {VideoFromPlan} from '@/remotion/VideoFromPlan';
import {planDurationInFrames, type Plan} from '@/remotion/plan';

type VoiceResult = {id: string; audioPath: string; audioUrl: string; audioSec: number};
type ImageResult = {id: string; imagePath: string; imageUrl: string};
type EpisodeRow = {id: string; title: string; updated_at: string};

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
  const [idea, setIdea] = useState('');
  const [audience, setAudience] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');

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
  }, [refreshList]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
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
    setVoicing(true);
    setError('');
    try {
      const data = await callApi<{scenes: VoiceResult[]}>('/api/voice', {
        scenes: plan.scenes.map((s) => ({id: s.id, narration: s.narration})),
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
    const todo = plan.scenes.filter((s) => !s.imagePath);
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
    setExporting(true);
    setError('');
    setVideoUrl('');
    try {
      const data = await callApi<{videoUrl: string}>('/api/export', {plan});
      setVideoUrl(data.videoUrl);
    } catch (e) {
      setError(message(e));
    } finally {
      setExporting(false);
    }
  }

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

      <textarea
        className="mt-6 w-full rounded border p-3"
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

      {error && <p className="mt-4 text-red-600">{error}</p>}

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
          <button
            className="ml-3 mt-3 rounded bg-purple-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={addImages}
          >
            {imaging ? 'Drawing pictures…' : 'Add pictures'}
          </button>
          <button
            className="ml-3 mt-3 rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={exportVideo}
          >
            {exporting ? 'Exporting video… (several minutes)' : 'Export MP4'}
          </button>
          {videoUrl && (
            <p className="mt-3">
              <a className="font-semibold text-blue-700 underline" href={videoUrl} download>
                Download your video
              </a>
            </p>
          )}
          <ol className="mt-6 space-y-3">
            {plan.scenes.map((s, i) => (
              <li key={s.id} className="rounded border p-4">
                <div className="font-semibold">
                  Scene {i + 1}: {s.title} ({s.durationSec}s)
                </div>
                <p className="mt-1">{s.narration}</p>
                <input
                  className="mt-1 w-full rounded border p-1 text-sm text-gray-700"
                  value={s.visualIdea}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      scenes: plan.scenes.map((x) =>
                        x.id === s.id
                          ? {...x, visualIdea: e.target.value, imagePath: undefined, imageUrl: undefined}
                          : x,
                      ),
                    })
                  }
                  onBlur={() => void saveEpisode(plan, episodeId)}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}