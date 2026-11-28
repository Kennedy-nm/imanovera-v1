// 6a plan.ts
export type ImageLayer = {
  id: string;
  type: 'image';
  fit: 'contain' | 'cover';
  // Saved in the database:
  path: string;
  // Temporary signed link, never saved:
  url?: string;
};
export type Layer = ImageLayer;

export type Scene = {
  id: string;
  title: string;
  narration: string;
  durationSec: number;
  visualIdea: string;
  background: string;
  textColor: string;
  // Saved in the database:
  audioPath?: string;
  imagePath?: string;
  // Your own photos (product videos). Optional.
  layers?: Layer[];
  // Temporary signed links, never saved:
  audioUrl?: string;
  imageUrl?: string;
};

export type Plan = {
  title: string;
  fps: number;
  width: number;
  height: number;
  starter?: 'explainer' | 'business';
  scenes: Scene[];
};

export const planDurationInFrames = (plan: Plan): number =>
  plan.scenes.reduce((total, s) => total + Math.round(s.durationSec * plan.fps), 0);