export type Scene = {
  id: string;
  title: string;
  narration: string;
  durationSec: number;
  visualIdea: string;
  background: string;
  textColor: string;
  audioUrl?: string;
  imageUrl?: string;
};

export type Plan = {
  title: string;
  fps: number;
  width: number;
  height: number;
  scenes: Scene[];
};

export const planDurationInFrames = (plan: Plan): number =>
  plan.scenes.reduce((total, s) => total + Math.round(s.durationSec * plan.fps), 0);