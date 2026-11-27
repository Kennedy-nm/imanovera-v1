import OpenAI from 'openai';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {signPaths} from '@/lib/media';

const openai = new OpenAI();

const Input = z.object({
  scenes: z
    .array(z.object({id: z.string().max(40), visualIdea: z.string().min(3).max(400)}))
    .min(1)
    .max(12),
});

const STYLE =
  'Friendly flat-colour educational cartoon illustration, simple shapes, bright clear colours, ' +
  'clean uncluttered composition, wide 16:9 scene, suitable for all ages. ' +
  'Do not include any text, letters, numbers or logos in the picture. Scene: ';

type Done = {id: string; imagePath: string};
type Failed = {id: string; reason: 'blocked' | 'error'};

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid picture descriptions.'}, {status: 400});
  }

  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  try {
    const results: (Done | Failed)[] = await Promise.all(
      parsed.data.scenes.map(async (scene): Promise<Done | Failed> => {
        try {
          const result = await openai.images.generate({
            model: 'gpt-image-2.5-flare',
            prompt: STYLE + scene.visualIdea,
            size: '1536x864',
            quality: 'low',
            output_format: 'jpeg',
            output_compression: 80,
          });
          const b64 = result.data?.[0]?.b64_json;
          if (!b64) throw new Error('No image returned');

          const imagePath = `${user.id}/images/${randomUUID()}.jpg`;
          const {error: uploadError} = await supabase.storage
            .from('assets')
            .upload(imagePath, Buffer.from(b64, 'base64'), {contentType: 'image/jpeg'});
          if (uploadError) throw uploadError;

          const {error: rowError} = await supabase.from('assets').insert({
            kind: 'generated_image',
            storage_path: imagePath,
            mime_type: 'image/jpeg',
            width: 1536,
            height: 864,
            meta: {sceneId: scene.id, prompt: scene.visualIdea},
          });
          if (rowError) throw rowError;

          return {id: scene.id, imagePath};
        } catch (e) {
          const code = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : '';
          console.error(`Picture failed for scene ${scene.id} (${code || 'unknown'}): ${scene.visualIdea}`);
          return {id: scene.id, reason: code === 'moderation_blocked' ? 'blocked' : 'error'};
        }
      }),
    );

    const done = results.filter((r): r is Done => 'imagePath' in r);
    const failed = results.filter((r): r is Failed => 'reason' in r);
    const urls = await signPaths(supabase, done.map((d) => d.imagePath));
    return NextResponse.json({
      scenes: done.map((d) => ({...d, imageUrl: urls.get(d.imagePath)})),
      failed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({error: 'Could not create the pictures right now. Please try again.'}, {status: 500});
  }
}