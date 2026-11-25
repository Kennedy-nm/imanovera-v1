import {Composition} from 'remotion';
import {VideoFromPlan} from './VideoFromPlan';
import {planDurationInFrames, type Plan} from './plan';

const placeholder: Plan = {
  title: 'Placeholder',
  fps: 30,
  width: 1280,
  height: 720,
  scenes: [
    {id: 's1', title: 'Hello', narration: 'Hello', durationSec: 3, visualIdea: '', background: '#1e6fd9', textColor: '#ffffff'},
  ],
};

export const RemotionRoot = () => (
  <Composition
    id="FromPlan"
    component={VideoFromPlan}
    durationInFrames={planDurationInFrames(placeholder)}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{plan: placeholder}}
    calculateMetadata={({props}) => ({
      durationInFrames: planDurationInFrames(props.plan),
      fps: props.plan.fps,
      width: props.plan.width,
      height: props.plan.height,
    })}
  />
);