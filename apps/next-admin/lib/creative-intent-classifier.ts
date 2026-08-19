/**
 * creative-intent-classifier.ts
 *
 * Robust NLP-based intent classifier for the Creative Studio chat interface.
 * Uses wink-NLP for POS tagging + tokenization, and wink-distance for fuzzy
 * matching — the same packages used in /create-listing-simple.
 *
 * Intent categories:
 *   'photo'    — user wants to generate / create new still images
 *   'video'    — user wants to build a storyboard or motion video from existing photos
 *   'save'     — user wants to save / export / download existing assets
 *   'refine'   — user wants to refine / redo a single existing photo
 *   'unknown'  — not enough signal to classify confidently
 *
 * Design principles:
 *   1. POS-aware: verb-object pairs weighted higher than bare nouns.
 *      "create a video" scores VIDEO higher than "video" alone.
 *   2. Negation-aware: "don't make a video" suppresses VIDEO score.
 *   3. Context-aware: if no photo candidates exist yet, VIDEO intent is
 *      impossible (you can't build a storyboard from nothing).
 *   4. Fuzzy: typos like "phto", "vido", "storyborad" still score correctly.
 *   5. Tie-break: PHOTO wins ties (safer default — always produce-able).
 */

// ── Lazy singleton — wink-nlp model is 1.8 MB, only load once ────────────────
let _nlp: any = null
let _its: any = null

function getNlp() {
  if (!_nlp) {
    // Dynamic require so Next.js does not bundle this at build time for SSR
    const winkNLP = require('wink-nlp')
    const model = require('wink-eng-lite-web-model')
    _nlp = winkNLP(model)
    _its = _nlp.its
  }
  return { nlp: _nlp, its: _its }
}

function getLevenshtein(a: string, b: string): number {
  const dist = require('wink-distance')
  return dist.string.levenshtein(a, b)
}

// ── Vocabulary banks ──────────────────────────────────────────────────────────

/** Verb lemmas that strongly signal intent to CREATE new imagery */
const PHOTO_VERBS = new Set([
  'generate', 'create', 'make', 'draw', 'render', 'produce', 'design',
  'build', 'shoot', 'capture', 'illustrate', 'paint', 'draft', 'craft',
  'show', 'give', 'get', 'need', 'want',
])

/** Nouns / adjectives that refer to static images */
const PHOTO_NOUNS = [
  'photo', 'photograph', 'image', 'picture', 'pic', 'shot', 'thumbnail',
  'candidate', 'graphic', 'illustration', 'render', 'frame', 'poster',
  'banner', 'still', 'snapshot', 'headshot',
]

/** Verb lemmas that signal STORYBOARD / MOTION VIDEO intent */
const VIDEO_VERBS = new Set([
  'animate', 'compile', 'compose', 'edit', 'transition', 'pan', 'zoom',
  'build', 'make', 'create', 'produce', 'assemble',
])

/** Nouns that refer to motion / video content */
const VIDEO_NOUNS = [
  'video', 'storyboard', 'reel', 'clip', 'animation', 'motion',
  'commercial', 'film', 'movie', 'slideshow', 'montage', 'cut', 'scene', 'sequence',
]

/** Words that refer to the pan-and-zoom effect specifically */
const MOTION_EFFECT_NOUNS = [
  'pan', 'zoom', 'kenburns', 'parallax', 'cinematic', 'movement', 'trajectory', 'camera',
]

/** Verb lemmas that signal SAVE / EXPORT intent */
const SAVE_VERBS = new Set(['save', 'export', 'download', 'keep', 'store', 'archive'])

/** Verb lemmas that signal REFINE intent */
const REFINE_VERBS = new Set([
  'refine', 'redo', 'retry', 'tweak', 'improve', 'regenerate', 'fix',
  'enhance', 'adjust', 'change', 'update',
])

/** Common negation tokens */
const NEGATIONS = new Set([
  'not', 'no', "don't", "doesn't", "didn't", "won't", "wouldn't", "never",
  "can't", 'cannot', 'neither', 'nor', 'without',
])

// ── Fuzzy match helpers ───────────────────────────────────────────────────────

function fuzzyMatchesAny(word: string, targets: string[], maxDist = 2): boolean {
  const w = word.toLowerCase()
  if (w.length < 3) return false
  return targets.some(t => {
    if (w === t) return true
    if (t.startsWith(w) && t.length - w.length <= 1) return true
    if (w === t + 's' || w === t + 'es') return true
    const dist = Math.abs(w.length - t.length) > 3 ? 999 : getLevenshtein(w, t)
    return dist <= Math.min(maxDist, Math.floor(t.length / 3))
  })
}

// ── Score model ───────────────────────────────────────────────────────────────

interface IntentScores {
  photo: number
  video: number
  save: number
  refine: number
}

function scoreTokens(tokens: string[], posTags: string[]): IntentScores {
  const n = tokens.length
  const negated: boolean[] = new Array(n).fill(false)

  // Mark tokens following negation words as negated (within window of 3)
  for (let i = 0; i < n; i++) {
    const tok = tokens[i].toLowerCase()
    if (NEGATIONS.has(tok)) {
      for (let j = i + 1; j < Math.min(n, i + 4); j++) negated[j] = true
    }
  }

  const scores: IntentScores = { photo: 0, video: 0, save: 0, refine: 0 }

  for (let i = 0; i < n; i++) {
    const tok = tokens[i].toLowerCase()
    const pos = posTags[i]
    const sign = negated[i] ? -1 : 1

    // ── PHOTO signals ──────────────────────────────────────────────────────
    if (fuzzyMatchesAny(tok, PHOTO_NOUNS)) {
      let w = 3
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (PHOTO_VERBS.has(tokens[j].toLowerCase())) { w = 5; break }
      }
      scores.photo += sign * w
    }
    if (pos === 'VERB' && PHOTO_VERBS.has(tok)) {
      let w = 1
      for (let j = i + 1; j < Math.min(n, i + 4); j++) {
        if (fuzzyMatchesAny(tokens[j].toLowerCase(), PHOTO_NOUNS)) { w = 4; break }
      }
      scores.photo += sign * w
    }

    // ── VIDEO signals ──────────────────────────────────────────────────────
    if (fuzzyMatchesAny(tok, VIDEO_NOUNS) || fuzzyMatchesAny(tok, MOTION_EFFECT_NOUNS)) {
      let w = 3
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (VIDEO_VERBS.has(tokens[j].toLowerCase())) { w = 5; break }
      }
      scores.video += sign * w
    }
    if (pos === 'VERB' && VIDEO_VERBS.has(tok)) {
      let w = 1
      for (let j = i + 1; j < Math.min(n, i + 4); j++) {
        if (fuzzyMatchesAny(tokens[j].toLowerCase(), VIDEO_NOUNS)) { w = 4; break }
      }
      scores.video += sign * w
    }

    // ── SAVE signals ───────────────────────────────────────────────────────
    if (pos === 'VERB' && SAVE_VERBS.has(tok)) scores.save += sign * 4
    if (tok === 'library' || tok === 'storage') scores.save += sign * 2

    // ── REFINE signals ─────────────────────────────────────────────────────
    if (pos === 'VERB' && REFINE_VERBS.has(tok)) scores.refine += sign * 4
    if (tok === 'again' || tok === 'another' || tok === 'different') scores.refine += sign * 2
  }

  return scores
}

// ── Public API ────────────────────────────────────────────────────────────────

export type CreativeIntent = 'photo' | 'video' | 'save' | 'refine' | 'unknown'

export interface IntentClassification {
  intent: CreativeIntent
  confidence: 'high' | 'medium' | 'low'
  scores: IntentScores
  /** Human-readable rationale for debugging */
  reason: string
}

/**
 * Classify the user's creative-studio prompt into an intent.
 *
 * @param text              The raw user prompt
 * @param hasPhotoCandidates Whether the workspace already has generated photos
 *                          (video storyboard requires existing photos)
 */
export function classifyCreativeIntent(
  text: string,
  hasPhotoCandidates: boolean
): IntentClassification {
  if (!text || !text.trim()) {
    return {
      intent: 'unknown',
      confidence: 'low',
      scores: { photo: 0, video: 0, save: 0, refine: 0 },
      reason: 'Empty prompt',
    }
  }

  const { nlp, its } = getNlp()
  const doc = nlp.readDoc(text)
  const tokens: string[] = doc.tokens().out(its.value)
  const posTags: string[] = doc.tokens().out(its.pos)

  const scores = scoreTokens(tokens, posTags)

  // Context constraint: cannot build storyboard without photos in workspace
  if (!hasPhotoCandidates) {
    scores.video = Math.min(scores.video, 0)
  }

  // Find the top two intents
  const ranked = (Object.keys(scores) as Array<keyof IntentScores>).sort(
    (a, b) => scores[b] - scores[a]
  )
  const best = ranked[0]
  const second = ranked[1]
  const bestScore = scores[best]
  const secondScore = scores[second]
  const gap = bestScore - secondScore

  // No positive signal at all — default to photo generation (always safe)
  if (bestScore <= 0) {
    return {
      intent: 'photo',
      confidence: 'low',
      scores,
      reason: `No positive signal (best=${bestScore}). Defaulting to photo generation.`,
    }
  }

  let confidence: 'high' | 'medium' | 'low'
  if (gap >= 4) confidence = 'high'
  else if (gap >= 2) confidence = 'medium'
  else confidence = 'low'

  // Tie-break on low confidence: PHOTO always wins over VIDEO
  // (avoids the original bug where "...use to create the video" routed to storyboard)
  if (confidence === 'low' && best === 'video' && scores.photo >= 0) {
    return {
      intent: 'photo',
      confidence: 'low',
      scores,
      reason: `Low-confidence tie photo(${scores.photo}) vs video(${scores.video}). Photo wins tie-break.`,
    }
  }

  return {
    intent: best as CreativeIntent,
    confidence,
    scores,
    reason: `${best}=${bestScore} vs ${second}=${secondScore} (gap=${gap}, confidence=${confidence}).`,
  }
}
