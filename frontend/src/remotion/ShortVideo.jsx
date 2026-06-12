import { AbsoluteFill } from 'remotion'
import { Video, Audio } from '@remotion/media'
import { VideoEffects } from './VideoEffects.jsx'
import { Subtitles } from './Subtitles.jsx'
import { HookOverlay } from './HookOverlay.jsx'

// Main composition: base video (optionally trimmed) + zoom/color effects, then
// subtitles, then hook, plus optional background music. Same component drives
// the browser <Player> preview AND the final render — preview == output.
export function ShortVideo({ videoUrl, trimBefore = 0, subtitles, hook, effects, music }) {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <VideoEffects config={effects}>
        <Video src={videoUrl} trimBefore={trimBefore}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </VideoEffects>
      {subtitles && <Subtitles config={subtitles} />}
      {hook && <HookOverlay config={hook} />}
      {music?.url && <Audio src={music.url} volume={music.volume ?? 1} />}
    </AbsoluteFill>
  )
}

export { DEFAULT_SUBTITLE_STYLE } from './lib.js'
