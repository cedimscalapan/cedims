import { Composition } from "remotion";
import { Film } from "./Film";
import { SampleEdit } from "./SampleEdit";
import { RecordedSample } from "./RecordedSample";
import { LaunchFilm } from "./LaunchFilm";
import { ReferenceLaunch } from "./ReferenceLaunch";
import { RebuiltLaunch } from "./RebuiltLaunch";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="SmartEVisionRebuilt" component={RebuiltLaunch} durationInFrames={3780} fps={30} width={1920} height={1080} />
      <Composition id="SmartEVisionReferenceStyle" component={ReferenceLaunch} durationInFrames={4200} fps={30} width={1920} height={1080} />
      <Composition id="SmartEVisionLaunch" component={LaunchFilm} durationInFrames={4200} fps={30} width={1920} height={1080} />
      <Composition id="CEDIMSRecordedSample" component={RecordedSample} durationInFrames={420} fps={30} width={1920} height={1080} />
      <Composition id="CEDIMSSample" component={SampleEdit} durationInFrames={450} fps={30} width={1920} height={1080} />
      <Composition id="CEDIMSFilm" component={Film} durationInFrames={1800} fps={30} width={1920} height={1080} />
    </>
  );
};
