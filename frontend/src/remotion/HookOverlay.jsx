import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'
import { getFontStack } from './lib.js'

// Hook text overlay. Vertical position is free (posY %), horizontal is a simple
// align (left/center/right) so the box never clips off-screen. Several minimal
// templates pick the visual style.
const SIZE = { XXS: 0.48, XS: 0.62, S: 0.82, M: 1.0, L: 1.25 }
const ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' }

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
  if (config.entranceAnimation === 'fade') {
    opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
  } else if (config.entranceAnimation === 'slide-up') {
    const p = spring({ frame, fps, config: { mass: 1, stiffness: 150, damping: 18 }, durationInFrames: 20 })
    translateY = interpolate(p, [0, 1], [60, 0]); opacity = interpolate(p, [0, 1], [0, 1])
  } else if (config.entranceAnimation !== 'none') {
    const p = spring({ frame, fps, config: { mass: 0.8, stiffness: 200, damping: 15 }, durationInFrames: 20 })
    animScale = interpolate(p, [0, 1], [0.7, 1]); opacity = interpolate(p, [0, 1], [0, 1])
  }
  const fadeOutStart = displayFrames - 15
  if (frame > fadeOutStart) {
    opacity *= interpolate(frame, [fadeOutStart, displayFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  }

  const fontSize = Math.round(1080 * 0.05 * scale)
  const badgeText = (config.badgeText || '').trim()
  const badgeColor = config.badgeColor || '#2D7FF9'
  const badgeTextColor = config.badgeTextColor || '#FFFFFF'
  const textColor = config.textColor || '#FFFFFF'
  const template = config.template || 'box'
  const align = config.align || 'center'
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'
  const font = getFontStack(config.font || 'Inter')

  // Vertical from posY% (fallback to legacy top/center/bottom preset).
  const posY = typeof config.posY === 'number' ? config.posY
    : config.position === 'center' ? 46 : config.position === 'bottom' ? 70 : 16

  return (
    <div style={{
      position: 'absolute', top: `${posY}%`, left: 0, right: 0,
      transform: 'translateY(-50%)', display: 'flex',
      justifyContent: ALIGN[align] || 'center', padding: '0 44px',
    }}>
      <div style={{
        opacity, transform: `scale(${animScale}) translateY(${translateY}px)`,
        maxWidth: '86%', textAlign: align,
      }}>
        {renderTemplate(template, { badgeText, badgeColor, badgeTextColor, textColor, fontSize, scale, alignItems, align, font, text: config.text })}
      </div>
    </div>
  )
}

function badgePill(badgeText, badgeColor, fontSize, scale, font, alignSelf = 'center', textColor = '#FFFFFF') {
  return (
    <span style={{
      backgroundColor: badgeColor, color: textColor, fontFamily: font,
      fontWeight: 800, fontStyle: 'italic', fontSize: Math.round(fontSize * 0.6),
      borderRadius: 10, padding: `${6 * scale}px ${15 * scale}px`, lineHeight: 1.1,
      whiteSpace: 'nowrap', alignSelf,
    }}>{badgeText}</span>
  )
}

function badgeLabel(badgeText, badgeColor, fontSize, font) {
  return (
    <span style={{
      color: badgeColor, fontFamily: font, fontWeight: 800, fontSize: Math.round(fontSize * 0.5),
      letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    }}>{badgeText}</span>
  )
}

function renderTemplate(template, p) {
  const { badgeText, badgeColor, badgeTextColor, textColor, fontSize, scale, alignItems, align, font, text } = p

  if (template === 'minimal') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems, gap: `${9 * scale}px` }}>
        {badgeText && badgeLabel(badgeText, badgeColor, fontSize, font)}
        <span style={{
          fontFamily: font, fontSize, fontWeight: 800, color: textColor, lineHeight: 1.22,
          textShadow: '0 3px 14px rgba(0,0,0,0.65)', wordBreak: 'break-word', textAlign: align,
        }}>{text}</span>
      </div>
    )
  }

  if (template === 'bar') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems, gap: `${7 * scale}px` }}>
        {badgeText && badgeLabel(badgeText, badgeTextColor, fontSize, font)}
        <span style={{
          backgroundColor: badgeColor, color: textColor, fontFamily: font, fontSize,
          fontWeight: 800, lineHeight: 1.5, padding: `${4 * scale}px ${16 * scale}px`,
          boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', wordBreak: 'break-word',
          textAlign: align,
        }}>{text}</span>
      </div>
    )
  }

  if (template === 'outline') {
    const s = Math.max(2, Math.round(fontSize * 0.055))
    const stroke = [
      `${s}px 0 0 #000`, `-${s}px 0 0 #000`, `0 ${s}px 0 #000`, `0 -${s}px 0 #000`,
      `${s}px ${s}px 0 #000`, `-${s}px -${s}px 0 #000`, `${s}px -${s}px 0 #000`, `-${s}px ${s}px 0 #000`,
    ].join(', ')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems, gap: `${8 * scale}px` }}>
        {badgeText && badgePill(badgeText, badgeColor, fontSize, scale, font, alignItems, badgeTextColor)}
        <span style={{
          fontFamily: font, fontSize: Math.round(fontSize * 1.08), fontWeight: 900,
          color: textColor, lineHeight: 1.15, textShadow: stroke, wordBreak: 'break-word', textAlign: align,
        }}>{text}</span>
      </div>
    )
  }

  // default: 'box' — white card with optional colored badge pill
  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: 22, padding: `${20 * scale}px ${24 * scale}px`,
      boxShadow: '0 8px 22px rgba(0,0,0,0.28)', display: 'inline-flex', flexDirection: 'column',
      alignItems, gap: `${13 * scale}px`,
    }}>
      {badgeText && badgePill(badgeText, badgeColor, fontSize, scale, font, alignItems, badgeTextColor)}
      <span style={{
        fontFamily: font, fontSize, fontWeight: 800, color: '#0a0a0a',
        lineHeight: 1.25, wordBreak: 'break-word', textAlign: align,
      }}>{text}</span>
    </div>
  )
}
