// 6a media.ts
import type {SupabaseClient} from '@supabase/supabase-js';

const BUCKET = 'assets';

type Obj = Record<string, unknown>;

// Every saved file a plan uses: narration, AI pictures and your own photos.
export function collectPaths(plan: Obj): string[] {
  const scenes = plan.scenes;
  if (!Array.isArray(scenes)) return [];
  const paths = new Set<string>();
  for (const s of scenes as Obj[]) {
    if (typeof s.audioPath === 'string') paths.add(s.audioPath);
    if (typeof s.imagePath === 'string') paths.add(s.imagePath);
    if (Array.isArray(s.layers)) {
      for (const l of s.layers as Obj[]) {
        if (typeof l.path === 'string') paths.add(l.path);
      }
    }
  }
  return [...paths];
}

export async function signPaths(supabase: SupabaseClient, paths: string[], expiresIn = 3600) {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const {data} = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  for (const item of data ?? []) {
    if (item.path && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export function stripUrls(plan: Obj): Obj {
  const scenes = plan.scenes;
  if (!Array.isArray(scenes)) return plan;
  return {
    ...plan,
    scenes: (scenes as Obj[]).map((s) => {
      const copy: Obj = {...s};
      delete copy.audioUrl;
      delete copy.imageUrl;
      if (Array.isArray(copy.layers)) {
        copy.layers = (copy.layers as Obj[]).map((l) => {
          const layer: Obj = {...l};
          delete layer.url;
          return layer;
        });
      }
      return copy;
    }),
  };
}

export async function signPlan(supabase: SupabaseClient, plan: Obj, expiresIn = 3600): Promise<Obj> {
  const scenes = plan.scenes;
  if (!Array.isArray(scenes)) return plan;
  const urls = await signPaths(supabase, collectPaths(plan), expiresIn);
  return {
    ...plan,
    scenes: (scenes as Obj[]).map((s) => {
      const withUrls: Obj = {
        ...s,
        audioUrl: typeof s.audioPath === 'string' ? urls.get(s.audioPath) : undefined,
        imageUrl: typeof s.imagePath === 'string' ? urls.get(s.imagePath) : undefined,
      };
      if (Array.isArray(s.layers)) {
        withUrls.layers = (s.layers as Obj[]).map((l) => ({
          ...l,
          url: typeof l.path === 'string' ? urls.get(l.path) : undefined,
        }));
      }
      return withUrls;
    }),
  };
}