import { renderMediaOnWeb } from '@remotion/web-renderer'
import { ShortVideo } from './ShortVideo.jsx'

// Render the final edited clip to an MP4 entirely in the browser (WebCodecs) —
// no server render service needed. Returns a blob URL. Same ShortVideo component
// as the live preview, so output == preview.
export async function renderInBrowser({ videoUrl, durationInSeconds = 10, fps = 30,
  trimBefore = 0, subtitles = null, hook = null, effects = null, music = null,
  onProgress, signal }) {
  const durationInFrames = Math.max(1, Math.round(durationInSeconds * fps))

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component: ShortVideo,
      durationInFrames, fps, width: 1080, height: 1920,
      id: 'ShortVideo', calculateMetadata: null,
    },
    inputProps: { videoUrl, durationInFrames, fps, width: 1080, height: 1920,
      trimBefore, subtitles, hook, effects, music },
    container: 'mp4', videoCodec: 'h264',
    // Explicit high bitrate (~20 Mbps) so the final render visually matches the
    // un-edited clip instead of the conservative 'high' preset.
    videoBitrate: 40_000_000, audioCodec: 'aac', audioBitrate: 192_000,
    delayRenderTimeoutInMilliseconds: 120000,
    onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
    signal,
  })

  const blob = await getBlob()
  return URL.createObjectURL(blob)
}

export function downloadBlobUrl(blobUrl, filename = 'clip.mp4') {
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
