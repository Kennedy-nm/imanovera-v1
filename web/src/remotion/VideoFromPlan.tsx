// 6a VideoFromPlan.tsx
import {AbsoluteFill, Html5Audio, Img, Sequence, interpolate, useCurrentFrame} from 'remotion';
import type {Plan, Scene} from './plan';

const SceneView: React.FC<{scene: Scene; durationInFrames: number}> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const photo = scene.layers?.find((l) => l.type === 'image' && l.url);
  const fullPicture = !photo && scene.imageUrl ? scene.imageUrl : null;

  const zoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1, photo ? 1.05 : 1.08]);
  const fade = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});
  const rise = interpolate(frame, [0, 15], [24, 0], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill
      style={{
        backgroundColor: scene.background,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {fullPicture && (
        <>
          <AbsoluteFill style={{overflow: 'hidden'}}>
            <Img
              src={fullPicture}
              style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{backgroundColor: 'rgba(0,0,0,0.2)'}} />
        </>
      )}

      {photo?.url && (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 110,
            bottom: 150,
            overflow: 'hidden',
            borderRadius: 16,
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Img
            src={photo.url}
            style={{width: '100%', height: '100%', objectFit: photo.fit, transform: `scale(${zoom})`}}
          />
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: photo ? 28 : 36,
          textAlign: 'center',
          color: scene.textColor,
          fontSize: 52,
          fontWeight: 800,
          opacity: fade,
          transform: `translateY(${rise}px)`,
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}
      >
        {scene.title}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          bottom: 30,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: '#ffffff',
            fontSize: 28,
            lineHeight: 1.3,
            textAlign: 'center',
            padding: '10px 20px',
            borderRadius: 14,
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        >
          {scene.narration}
        </span>
      </div>

      {scene.audioUrl && <Html5Audio src={scene.audioUrl} />}
    </AbsoluteFill>
  );
};

export const VideoFromPlan: React.FC<{plan: Plan}> = ({plan}) => {
  let from = 0;
  return (
    <AbsoluteFill>
      {plan.scenes.map((scene) => {
        const durationInFrames = Math.max(1, Math.round(scene.durationSec * plan.fps));
        const start = from;
        from += durationInFrames;
        return (
          <Sequence key={scene.id} from={start} durationInFrames={durationInFrames}>
            <SceneView scene={scene} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};