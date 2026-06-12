import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion'

// Wraps the base video with smooth zoom + color, interpolated between segments.
// Ported from openshorts VideoEffects.tsx — CSS transform/filter, so it previews
// in the browser identically to the final render.
export function VideoEffects({ config, children }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (!config || !config.segments || config.segments.length === 0) {
    return children
  }

  const t = frame / fps
  const v = getInterpolated(config.segments, t, frame, fps)

  const parts = []
  if (v.brightness !== 1) parts.push(`brightness(${v.brightness})`)
  if (v.contrast !== 1) parts.push(`contrast(${v.contrast})`)
  if (v.saturate !== 1) parts.push(`saturate(${v.saturate})`)
  const filter = parts.length ? parts.join(' ') : 'none'

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div style={{
        width: '100%', height: '100%',
        transform: `scale(${v.zoom})`,
        transformOrigin: `${v.centerX * 100}% ${v.centerY * 100}%`,
        filter,
      }}>
        {children}
      </div>
    </div>
  )
}

const lerp = (a, b, t) => a + (b - a) * t
const DEF = { zoom: 1, centerX: 0.5, centerY: 0.5, brightness: 1, contrast: 1, saturate: 1 }

function lerpSeg(a, b, t) {
  return {
    zoom: lerp(a.zoom, b.zoom, t), centerX: lerp(a.zoomCenterX, b.zoomCenterX, t),
    centerY: lerp(a.zoomCenterY, b.zoomCenterY, t), brightness: lerp(a.brightness, b.brightness, t),
    contrast: lerp(a.contrast, b.contrast, t), saturate: lerp(a.saturate, b.saturate, t),
  }
}
function lerpTo(seg, t, d) {
  return {
    zoom: lerp(seg.zoom, d.zoom, t), centerX: lerp(seg.zoomCenterX, d.centerX, t),
    centerY: lerp(seg.zoomCenterY, d.centerY, t), brightness: lerp(seg.brightness, d.brightness, t),
    contrast: lerp(seg.contrast, d.contrast, t), saturate: lerp(seg.saturate, d.saturate, t),
  }
}
function lerpFrom(seg, t, d) {
  return {
    zoom: lerp(d.zoom, seg.zoom, t), centerX: lerp(d.centerX, seg.zoomCenterX, t),
    centerY: lerp(d.centerY, seg.zoomCenterY, t), brightness: lerp(d.brightness, seg.brightness, t),
    contrast: lerp(d.contrast, seg.contrast, t), saturate: lerp(d.saturate, seg.saturate, t),
  }
}

function getInterpolated(segments, timeSec, frame, fps) {
  const active = segments.find((s) => timeSec >= s.startSec && timeSec < s.endSec)
  if (!active) {
    const prev = segments.filter((s) => s.endSec <= timeSec).pop()
    const next = segments.find((s) => s.startSec > timeSec)
    if (prev && next) {
      const gap = next.startSec - prev.endSec
      if (gap < 1.0) return lerpSeg(prev, next, (timeSec - prev.endSec) / gap)
    }
    if (prev) {
      const e = timeSec - prev.endSec
      if (e < 0.3) return lerpTo(prev, e / 0.3, DEF)
    }
    if (next) {
      const r = next.startSec - timeSec
      if (r < 0.3) return lerpFrom(next, 1 - r / 0.3, DEF)
    }
    return DEF
  }
  const segDur = active.endSec - active.startSec
  const trSec = Math.min(0.3, segDur * 0.15)
  const sf = Math.round(active.startSec * fps)
  const ef = Math.round(active.endSec * fps)
  const tf = Math.round(trSec * fps)
  const entrance = interpolate(frame, [sf, sf + tf], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const exit = interpolate(frame, [ef - tf, ef], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const f = Math.min(entrance, exit)
  return {
    zoom: lerp(1, active.zoom, f), centerX: lerp(0.5, active.zoomCenterX, f),
    centerY: lerp(0.5, active.zoomCenterY, f), brightness: lerp(1, active.brightness, f),
    contrast: lerp(1, active.contrast, f), saturate: lerp(1, active.saturate, f),
  }
}
