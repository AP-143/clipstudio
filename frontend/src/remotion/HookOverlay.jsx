import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'

// Hook text overlay with entrance/exit animation. Ported from openshorts.
const SIZE = { S: 0.8, M: 1.0, L: 1.3 }
const POSITION = {
  top: { top: '16%', bottom: 'auto' },
  center: { top: '46%', bottom: 'auto' },
  bottom: { top: '66%', bottom: 'auto' },
}

export function HookOverlay({ config }) {
  const { fps } = useVideoConfig()
  if (!config || !config.text) return null
  const displayFrames = Math.round((config.displayDurationSec || 3) * fps)
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={displayFrames} layout="none">
        <Box config={config} displayFrames={displayFrames} />
      </Sequence>
    </AbsoluteFill>
  )
}

function Box({ config, displayFrames }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = SIZE[config.size] || 1.0

  let opacity = 1, animScale = 1, translateY = 0
  if (config.entranceAnimation === 'spring') {
    const p = spring({ frame, fps, config: { mass: 0.8, stiffness: 200, damping: 15 }, durationInFrames: 20 })
    animScale = interpolate(p, [0, 1], [0.7, 1]); opacity = interpolate(p, [0, 1], [0, 1])
  } else if (config.entranceAnimation === 'fade') {
    opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
  } else if (config.entranceAnimation === 'slide-up') {
    const p = spring({ frame, fps, config: { mass: 1, stiffness: 150, damping: 18 }, durationInFrames: 20 })
    translateY = interpolate(p, [0, 1], [60, 0]); opacity = interpolate(p, [0, 1], [0, 1])
  }
  const fadeOutStart = displayFrames - 15
  if (frame > fadeOutStart) {
    opacity *= interpolate(frame, [fadeOutStart, displayFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  }

  const pos = POSITION[config.position] || POSITION.top
  const fontSize = Math.round(1080 * 0.05 * scale)
  const badgeText = config.badgeText
  const badgeColor = config.badgeColor || '#2D7FF9'

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center', ...pos }}>
      <div style={{
        opacity, transform: `scale(${animScale}) translateY(${translateY}px)`, maxWidth: '88%',
        backgroundColor: '#FFFFFF', borderRadius: 22,
        padding: `${22 * scale}px ${26 * scale}px`, boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${14 * scale}px`,
      }}>
        {badgeText && (
          <span style={{
            backgroundColor: badgeColor, color: '#FFFFFF',
            fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 800, fontStyle: 'italic',
            fontSize: Math.round(fontSize * 0.62), borderRadius: 10,
            padding: `${6 * scale}px ${16 * scale}px`, lineHeight: 1.1, whiteSpace: 'nowrap',
          }}>
            {badgeText}
          </span>
        )}
        <span style={{
          fontFamily: 'Inter, system-ui, sans-serif', fontSize, fontWeight: 800,
          color: '#0a0a0a', lineHeight: 1.25, wordBreak: 'break-word',
        }}>
          {config.text}
        </span>
      </div>
    </div>
  )
}
