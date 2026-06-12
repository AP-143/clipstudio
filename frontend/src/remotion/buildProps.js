import { DEFAULT_SUBTITLE_STYLE } from './lib.js'

const SUB_SIZE = { S: 48, M: 64, L: 84 }

// Turn a saved editor config + runtime data into Remotion ShortVideo props.
// Shared by the live editor and "Render Semua" so both behave identically.
// Handles trim by rebasing captions/effects and trimming the source video.
export function buildShortProps(cfg = {}, { captions = [], durationSec = 10, fps = 30,
  videoUrl = null, musicUrl = null } = {}) {
  const trimStart = Math.min(Math.max(0, cfg.trimIn || 0), Math.max(0, durationSec - 0.5))
  const trimEnd = (cfg.trimOut != null) ? cfg.trimOut : durationSec
  const effDur = Math.max(0.5, trimEnd - trimStart)
  const trimBefore = Math.round(trimStart * fps)

  const subStyle = {
    ...DEFAULT_SUBTITLE_STYLE,
    fontColor: cfg.subColor || '#FFFFFF',
    highlightColor: cfg.subHi || '#FFDD00',
    animation: cfg.subAnim || 'pop',
    fontSize: SUB_SIZE[cfg.subSize || 'M'],
  }

  const caps = captions
    .map((c) => ({ text: c.text, startMs: c.startMs - trimStart * 1000, endMs: c.endMs - trimStart * 1000 }))
    .filter((c) => c.endMs > 0 && c.startMs < effDur * 1000)

  const fx = cfg.effects ? {
    segments: cfg.effects.segments
      .map((s) => ({ ...s, startSec: s.startSec - trimStart, endSec: s.endSec - trimStart }))
      .filter((s) => s.endSec > 0 && s.startSec < effDur)
      .map((s) => ({ ...s, startSec: Math.max(0, s.startSec), endSec: Math.min(effDur, s.endSec) })),
  } : null

  const inputProps = {
    videoUrl, trimBefore,
    subtitles: cfg.subOn ? { captions: caps, position: cfg.subPos || 'bottom', style: subStyle } : null,
    hook: (cfg.hookOn && (cfg.hookText || '').trim())
      ? {
        text: cfg.hookText.trim(), badgeText: (cfg.badgeText || '').trim() || undefined,
        badgeColor: cfg.badgeColor || '#2D7FF9', position: cfg.hookPos || 'top',
        size: cfg.hookSize || 'M', entranceAnimation: 'spring',
        displayDurationSec: cfg.hookDur === 'full' ? effDur : (cfg.hookDur || 3),
      }
      : null,
    effects: cfg.effectsOn
      ? (fx || { segments: [{ startSec: 0, endSec: effDur, zoom: 1, zoomCenterX: 0.5, zoomCenterY: 0.34, brightness: 1, contrast: 1.05, saturate: 1.1 }] })
      : null,
    music: musicUrl ? { url: musicUrl, volume: cfg.musicVolume ?? 0.5 } : null,
  }
  return { inputProps, durationInSeconds: effDur, fps }
}
