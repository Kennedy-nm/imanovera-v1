import {Composition} from 'remotion';
import {VideoFromPlan} from './VideoFromPlan';
import {planDurationInFrames, samplePlan} from './plan';

export const RemotionRoot = () => (
  <Composition
    id="FromPlan"
    component={VideoFromPlan}
    durationInFrames={planDurationInFrames(samplePlan)}
    fps={samplePlan.fps}
    width={samplePlan.width}
    height={samplePlan.height}
    defaultProps={{plan: samplePlan}}
    calculateMetadata={({props}) => ({
      durationInFrames: planDurationInFrames(props.plan),
      fps: props.plan.fps,
      width: props.plan.width,
      height: props.plan.height,
    })}
  />
);