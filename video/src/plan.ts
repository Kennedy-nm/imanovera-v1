export type Scene = {
  id: string;
  title: string;
  narration: string;
  durationSec: number;
  background: string;
  textColor: string;
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

export const samplePlan: Plan = {
  title: 'Where does rain come from?',
  fps: 30,
  width: 1280,
  height: 720,
  scenes: [
    {id: 's1', title: 'The sun heats the water', narration: 'The sun warms oceans, lakes and rivers.', durationSec: 4, background: '#1e6fd9', textColor: '#ffffff'},
    {id: 's2', title: 'Water rises as vapour', narration: 'Warm water turns into invisible vapour and rises into the sky.', durationSec: 4, background: '#5b8def', textColor: '#ffffff'},
    {id: 's3', title: 'Clouds form and rain falls', narration: 'High up, the vapour cools, forms clouds, and falls as rain.', durationSec: 4, background: '#3b4a63', textColor: '#ffffff'},
  ],
};