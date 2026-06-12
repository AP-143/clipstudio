// Caption grouping + font helpers for the Remotion subtitle layer.
// Ported from openshorts (remotion/src/lib/captions.ts + fonts.ts).

// Group word-level captions into short display blocks (max chars / duration).
export function groupCaptionsIntoBlocks(captions, maxChars = 20, maxDurationMs = 2000) {
  const blocks = []
  let cur = []
  let blockStartMs = 0
  for (const w of captions) {
    if (cur.length === 0) {
      cur.push(w); blockStartMs = w.startMs; continue
    }
    const len = cur.reduce((s, x) => s + x.text.length + 1, 0)
    const dur = w.endMs - blockStartMs
    if (len + w.text.length > maxChars || dur > maxDurationMs) {
      const last = cur[cur.length - 1]
      blocks.push({ words: [...cur], startMs: blockStartMs, endMs: last.endMs })
      cur = [w]; blockStartMs = w.startMs
    } else {
      cur.push(w)
    }
  }
  if (cur.length) {
    const last = cur[cur.length - 1]
    blocks.push({ words: [...cur], startMs: blockStartMs, endMs: last.endMs })
  }
  return blocks
}

export function getActiveWordIndex(words, timeMs) {
  for (let i = 0; i < words.length; i++) {
    if (timeMs >= words[i].startMs && timeMs < words[i].endMs) return i
  }
  return -1
}

const FONT_STACKS = {
  Inter: "Inter, system-ui, sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  Impact: "Impact, Haettenschweiler, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Verdana: "Verdana, Geneva, sans-serif",
}
export function getFontStack(f) { return FONT_STACKS[f] || f || FONT_STACKS.Inter }

// Default subtitle look — configs only carry the dynamic bits (captions/position).
export const DEFAULT_SUBTITLE_STYLE = {
  fontFamily: 'Impact',
  fontSize: 64,
  fontColor: '#FFFFFF',
  highlightColor: '#FFDD00',
  borderColor: '#000000',
  borderWidth: 4,
  bgColor: '#000000',
  bgOpacity: 0,
  animation: 'pop',
}
