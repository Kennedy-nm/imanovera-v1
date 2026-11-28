// 6b upload route.ts
import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {data: auth} = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({error: 'Please sign in.'}, {status: 401});

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({error: 'No photo received.'}, {status: 400});
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({error: 'Please use a JPG, PNG or WebP photo.'}, {status: 400});
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({error: 'That photo is larger than 8 MB. Please choose a smaller one.'}, {status: 400});
  }

  try {
    // Re-encode every upload as a plain JPEG: this also proves it is a real image,
    // fixes phone rotation and removes hidden data such as GPS location.
    const {default: sharp} = await import('sharp');
    const input = Buffer.from(await file.arrayBuffer());
    const {data: bytes, info} = await sharp(input, {limitInputPixels: 80_000_000})
      .rotate()
      .resize({width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true})
      .flatten({background: '#ffffff'})
      .jpeg({quality: 85})
      .toBuffer({resolveWithObject: true});

    const path = `${user.id}/photos/${randomUUID()}.jpg`;
    const {error: uploadError} = await supabase.storage
      .from('assets')
      .upload(path, bytes, {contentType: 'image/jpeg'});
    if (uploadError) throw uploadError;

    const {error: rowError} = await supabase.from('assets').insert({
      kind: 'product_photo',
      storage_path: path,
      mime_type: 'image/jpeg',
      width: info.width,
      height: info.height,
    });
    if (rowError) throw rowError;

    return NextResponse.json({path});
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {error: 'Could not use that photo. Please try a different JPG, PNG or WebP image.'},
      {status: 400},
    );
  }
}