'use client';
import {useState} from 'react';
import {Player} from '@remotion/player';
import {VideoFromPlan} from '@/remotion/VideoFromPlan';
import {planDurationInFrames, type Plan} from '@/remotion/plan';
type VoiceResult = {id: string; audioUrl: string; audioSec: number};
type ImageResult = {id: string; imageUrl: string};
export default function Home() {
  const [idea, setIdea] = useState('');
  const [audience, setAudience] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voicing, setVoicing] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  async function create() {
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({idea, audience: audience || undefined}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setPlan(data.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }
async function addVoice() {
  if (!plan) return;
  setVoicing(true);
  setError('');
  try {
    const res = await fetch('/api/voice', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({scenes: plan.scenes.map((s) => ({id: s.id, narration: s.narration}))}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    const byId = new Map((data.scenes as VoiceResult[]).map((s) => [s.id, s] as const));
    setPlan({
      ...plan,
      scenes: plan.scenes.map((s) => {
        const a = byId.get(s.id);
        return a ? {...s, audioUrl: a.audioUrl, durationSec: Math.ceil((a.audioSec + 0.8) * 10) / 10} : s;
      }),
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Something went wrong.');
  } finally {
    setVoicing(false);
  }
}
async function addImages() {
  if (!plan) return;
  setImaging(true);
  setError('');
  try {
    const res = await fetch('/api/images', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({scenes: plan.scenes.map((s) => ({id: s.id, visualIdea: s.visualIdea}))}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    const byId = new Map((data.scenes as ImageResult[]).map((s) => [s.id, s.imageUrl] as const));
    setPlan((p) => (p ? {...p, scenes: p.scenes.map((s) => ({...s, imageUrl: byId.get(s.id) ?? s.imageUrl}))} : p));
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Something went wrong.');
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
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({plan}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    setVideoUrl(data.videoUrl);
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Something went wrong.');
  } finally {
    setExporting(false);
  }
}
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Imanovera</h1>
      <p className="mt-1 text-gray-600">Tell me your video idea and I will plan it with you.</p>

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
        disabled={loading || idea.trim().length < 10}
        onClick={create}
      >
        {loading ? 'Planning your video…' : 'Create my plan'}
      </button>
      <button
        className="ml-3 mt-3 rounded bg-purple-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        disabled={imaging}
        onClick={addImages}
      >
        {imaging ? 'Drawing pictures…' : 'Add pictures'}
      </button>
        <button
          className="ml-3 mt-3 rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={exporting}
          onClick={exportVideo}
        >
          {exporting ? 'Exporting video… (about a minute)' : 'Export MP4'}
        </button>
        {videoUrl && (
          <p className="mt-3">
            <a className="font-semibold text-blue-700 underline" href={videoUrl} download>
              Download your video
            </a>
          </p>
)}
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
            style={{width: '100%', marginTop: 16, borderRadius: 12}}
          />
          <button
            className="mt-3 rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={voicing}
            onClick={addVoice}
          >
            {voicing ? 'Recording narration…' : 'Add narration'}
          </button>
          <ol className="mt-4 space-y-3">
            {plan.scenes.map((s, i) => (
              <li key={s.id} className="rounded border p-4">
                <div className="font-semibold">
                  Scene {i + 1}: {s.title} ({s.durationSec}s)
                </div>
                <p className="mt-1">{s.narration}</p>
                <p className="mt-1 text-sm text-gray-500">Picture: {s.visualIdea}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}