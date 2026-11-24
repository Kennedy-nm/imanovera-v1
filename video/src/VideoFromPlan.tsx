import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import type {Plan, Scene} from './plan';

const SceneView = ({scene, frames}: {scene: Scene; frames: number}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [frames - 10, frames], [1, 0], {extrapolateLeft: 'clamp'});
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(frame, [0, 15], [40, 0], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: scene.background, justifyContent: 'center', alignItems: 'center', fontFamily: 'Arial, sans-serif'}}>
      <div style={{opacity, transform: `translateY(${rise}px)`, color: scene.textColor, fontSize: 72, fontWeight: 700, textAlign: 'center', padding: '0 80px'}}>
        {scene.title}
      </div>
      <div style={{position: 'absolute', bottom: 60, left: 80, right: 80, opacity, textAlign: 'center', color: scene.textColor, fontSize: 36, background: 'rgba(0,0,0,0.35)', borderRadius: 16, padding: '16px 24px'}}>
        {scene.narration}
      </div>
    </AbsoluteFill>
  );
};

export const VideoFromPlan = ({plan}: {plan: Plan}) => {
  let start = 0;
  return (
    <AbsoluteFill>
      {plan.scenes.map((scene) => {
        const frames = Math.round(scene.durationSec * plan.fps);
        const from = start;
        start += frames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={frames}>
            <SceneView scene={scene} frames={frames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};