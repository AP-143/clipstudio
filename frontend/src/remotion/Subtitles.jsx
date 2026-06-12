import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'
import { groupCaptionsIntoBlocks, getActiveWordIndex, getFontStack } from './lib.js'

// Word-level animated subtitles. Ported from openshorts Subtitles.tsx.
const POSITION = {
  top: { top: '12%', bottom: 'auto' },
  middle: { top: '45%', bottom: 'auto' },
  bottom: { bottom: '10%', top: 'auto' },
}

export function Subtitles({ config }) {
  const { fps } = useVideoConfig()
  if (!config || !config.captions?.length) return null
  const blocks = groupCaptionsIntoBlocks(config.captions)

  return (
    <AbsoluteFill>
      {blocks.map((block, i) => {
        const from = Math.round((block.startMs / 1000) * fps)
        const dur = Math.max(1, Math.round(((block.endMs - block.startMs) / 1000) * fps))
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <Block block={block} config={config} blockStartMs={block.startMs} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

function Block({ block, config, blockStartMs }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { style, position } = config
  const timeMs = blockStartMs + (frame / fps) * 1000
  const active = getActiveWordIndex(block.words, timeMs)
  const pos = POSITION[position] || POSITION.bottom

  const hasBg = style.bgOpacity > 0
  const bg = hasBg ? {
    backgroundColor: `${style.bgColor}${Math.round(style.bgOpacity * 255).toString(16).padStart(2, '0')}`,
    borderRadius: 10, padding: '8px 16px',
  } : {}

  if (style.animation === 'word-by-word') {
    let cur = active
    if (cur === -1) {
      for (let i = block.words.length - 1; i >= 0; i--) {
        if (timeMs >= block.words[i].startMs) { cur = i; break }
      }
      if (cur === -1) cur = 0
    }
    const w = block.words[cur]
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center', ...pos }}>
        <div style={{ display: 'flex', justifyContent: 'center', maxWidth: '85%', ...bg }}>
          <Word key={cur} word={w.text} isActive style={style} frame={frame} fps={fps}
            wordStartMs={w.startMs} blockStartMs={blockStartMs} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center', ...pos }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 10px', maxWidth: '85%', ...bg }}>
        {block.words.map((w, i) => (
          <Word key={i} word={w.text} isActive={i === active} style={style}
            frame={frame} fps={fps} wordStartMs={w.startMs} blockStartMs={blockStartMs} />
        ))}
      </div>
    </div>
  )
}

function Word({ word, isActive, style, frame, fps, wordStartMs, blockStartMs }) {
  const wordStartFrame = Math.round(((wordStartMs - blockStartMs) / 1000) * fps)
  const anim = style.animation
  let transform = ''
  let color = style.fontColor
  let extra = {}

  if (isActive) {
    color = style.highlightColor
    if (anim === 'pop') {
      const s = spring({ frame: frame - wordStartFrame, fps, config: { mass: 0.5, stiffness: 300, damping: 12 }, durationInFrames: 10 })
      transform = `scale(${interpolate(s, [0, 1], [1, 1.25])})`
    } else if (anim === 'karaoke') {
      extra = { backgroundColor: style.highlightColor, color: style.bgColor || '#000', borderRadius: 6, padding: '2px 8px' }
    } else if (anim === 'word-highlight') {
      extra = { textShadow: `0 0 12px ${style.highlightColor}, 0 0 24px ${style.highlightColor}66` }
    } else if (anim === 'word-by-word') {
      const s = spring({ frame: frame - wordStartFrame, fps, config: { mass: 0.4, stiffness: 260, damping: 14 }, durationInFrames: 8 })
      transform = `scale(${interpolate(s, [0, 1], [0.4, 1])})`
    }
  }

  const stroke = style.borderWidth > 0 ? [
    `${style.borderWidth}px 0 0 ${style.borderColor}`, `-${style.borderWidth}px 0 0 ${style.borderColor}`,
    `0 ${style.borderWidth}px 0 ${style.borderColor}`, `0 -${style.borderWidth}px 0 ${style.borderColor}`,
  ].join(', ') : 'none'

  return (
    <span style={{
      fontFamily: getFontStack(style.fontFamily), fontSize: style.fontSize, fontWeight: 800,
      color: anim === 'karaoke' && isActive ? undefined : color,
      textShadow: anim !== 'karaoke' ? [stroke, extra.textShadow].filter(Boolean).join(', ') : stroke,
      transform, display: 'inline-block', ...extra,
    }}>
      {word}
    </span>
  )
}
