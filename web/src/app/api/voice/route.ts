import OpenAI from 'openai';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {signPaths} from '@/lib/media';

const openai = new OpenAI();

const Input = z.object({
  scenes: z
    .array(z.object({id: z.string().max(40), narration: z.string().min(1).max(600)}))
    .min(1)
    .max(12),
});

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid narration text.'}, {status: 400});
  }

  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  try {
    const {parseBuffer} = await import('music-metadata');

    const made = await Promise.all(
      parsed.data.scenes.map(async (scene) => {
        const speech = await openai.audio.speech.create({
          model: 'gpt-4o-mini-tts',
          voice: 'alloy',
          input: scene.narration,
          instructions: 'Speak warmly and clearly, like a friendly teacher.',
          response_format: 'mp3',
        });
        const bytes = new Uint8Array(await speech.arrayBuffer());
        const meta = await parseBuffer(bytes, {mimeType: 'audio/mpeg'});
        const audioSec = meta.format.duration ?? 5;

        const audioPath = `${user.id}/audio/${randomUUID()}.mp3`;
        const {error: uploadError} = await supabase.storage
          .from('assets')
          .upload(audioPath, bytes, {contentType: 'audio/mpeg'});
        if (uploadError) throw uploadError;

        const {error: rowError} = await supabase.from('assets').insert({
          kind: 'narration',
          storage_path: audioPath,
          mime_type: 'audio/mpeg',
          duration_sec: audioSec,
          meta: {sceneId: scene.id},
        });
        if (rowError) throw rowError;

        return {id: scene.id, audioPath, audioSec};
      }),
    );

    const urls = await signPaths(supabase, made.map((m) => m.audioPath));
    return NextResponse.json({scenes: made.map((m) => ({...m, audioUrl: urls.get(m.audioPath)}))});
  } catch (e) {
    console.error(e);
    return NextResponse.json({error: 'Could not create the narration right now. Please try again.'}, {status: 500});
  }
}