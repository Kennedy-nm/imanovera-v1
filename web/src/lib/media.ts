import type {SupabaseClient} from '@supabase/supabase-js';

const BUCKET = 'assets';

export async function signPaths(supabase: SupabaseClient, paths: string[], expiresIn = 3600) {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const {data} = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  for (const item of data ?? []) {
    if (item.path && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export function stripUrls(plan: Record<string, unknown>): Record<string, unknown> {
  const scenes = plan.scenes;
  if (!Array.isArray(scenes)) return plan;
  return {
    ...plan,
    scenes: scenes.map((s) => {
      const copy = {...(s as Record<string, unknown>)};
      delete copy.audioUrl;
      delete copy.imageUrl;
      return copy;
    }),
  };
}

export async function signPlan(
  supabase: SupabaseClient,
  plan: Record<string, unknown>,
  expiresIn = 3600,
): Promise<Record<string, unknown>> {
  const scenes = plan.scenes;
  if (!Array.isArray(scenes)) return plan;
  const list = scenes as Record<string, unknown>[];
  const paths = list
    .flatMap((s) => [s.audioPath, s.imagePath])
    .filter((p): p is string => typeof p === 'string');
  const urls = await signPaths(supabase, paths, expiresIn);
  return {
    ...plan,
    scenes: list.map((s) => ({
      ...s,
      audioUrl: typeof s.audioPath === 'string' ? urls.get(s.audioPath) : undefined,
      imageUrl: typeof s.imagePath === 'string' ? urls.get(s.imagePath) : undefined,
    })),
  };
}