/**
 * Layout for the XR panels: the desktop HUD's cards, rows and button grids, worked out in CSS pixels.
 * Pure (text width comes from an injected `measure`), so layouts are unit-tested without a canvas.
 * draw.ts paints a layout; XRPanel.tsx turns it into one textured plane and hit-tests pointers against it.
 */

export type ButtonVariant = 'default' | 'on' | 'primary' | 'danger' | 'tab'

export interface ButtonItem {
  type: 'button'
  id: string
  label: string
  variant?: ButtonVariant
  disabled?: boolean
  /** Fixed width in px, 'auto' (label + padding), or omitted to share the row by `flex`. */
  width?: number | 'auto'
  flex?: number
  align?: 'left' | 'center'
}
export interface TextItem {
  type: 'text'
  text: string
  size?: number
  weight?: number
  color?: 'text' | 'muted' | 'faint' | 'copper' | 'live' | 'warn'
  font?: 'ui' | 'display'
  width?: number | 'auto'
  flex?: number
  align?: 'left' | 'center' | 'right'
  /** Wrap onto at most this many lines (the last one is cut with …). Default 1. */
  maxLines?: number
}
export interface ChipItem {
  type: 'chip'
  text: string
  tone?: 'live' | 'warn' | 'idle'
  width?: number | 'auto'
  flex?: number
}
export interface LogoItem {
  type: 'logo'
  size: number
}
export interface SpacerItem {
  type: 'spacer'
  width?: number
  flex?: number
}
/** A grab strip for moving the panel (drawn here, made grabbable by XRPanel). */
export interface HandleItem {
  type: 'handle'
  id: string
  label: string
  flex?: number
}
export type Item = ButtonItem | TextItem | ChipItem | LogoItem | SpacerItem | HandleItem

export interface Row {
  type: 'row'
  items: Item[]
  /** Row height; defaults to the tallest item. */
  height?: number
  gap?: number
}
export interface Grid {
  type: 'grid'
  columns: number
  items: ButtonItem[]
  rowHeight?: number
  gap?: number
}
export interface Card {
  type: 'card'
  /** 'brand' adds the ember glow of the HUD's title card; 'bare' has no background (chips, hints). */
  tone?: 'plain' | 'brand' | 'bare'
  padding?: number
  gap?: number
  blocks: (Row | Grid)[]
}
export interface PanelSpec {
  /** Panel width in CSS px (the desktop HUD is 560). */
  width: number
  /** Gap between cards (the HUD's 10px). */
  gap?: number
  cards: Card[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export type FontSpec = { size: number; weight: number; family: 'ui' | 'display' }
export type Measure = (text: string, font: FontSpec) => number

export type Node =
  | { kind: 'card'; rect: Rect; tone: NonNullable<Card['tone']> }
  | { kind: 'button'; rect: Rect; item: ButtonItem; font: FontSpec; label: string }
  | { kind: 'text'; rect: Rect; item: TextItem; font: FontSpec; lines: string[] }
  | { kind: 'chip'; rect: Rect; item: ChipItem; font: FontSpec; label: string }
  | { kind: 'logo'; rect: Rect }
  | { kind: 'handle'; rect: Rect; item: HandleItem; font: FontSpec }

export interface Hit {
  id: string
  rect: Rect
  disabled: boolean
  /** Grab strips move the panel instead of pressing. */
  handle?: boolean
}
export interface PanelLayout {
  width: number
  height: number
  nodes: Node[]
  hits: Hit[]
}

/** Matches `.hud button` (12.5px / 500) and `.hud-tab` / `.tool-label` (12–12.5px / 600). */
export const BUTTON_FONT: FontSpec = { size: 12.5, weight: 500, family: 'ui' }
export const BUTTON_FONT_STRONG: FontSpec = { size: 12.5, weight: 600, family: 'ui' }
export const TAB_FONT: FontSpec = { size: 12, weight: 600, family: 'ui' }
const BUTTON_PAD_X = 11
const BUTTON_H = 33
const TAB_H = 33
const LINE = 1.35

function itemFont(item: Item): FontSpec {
  if (item.type === 'button') return item.variant === 'tab' ? TAB_FONT : item.align === 'left' || item.variant === 'on' || item.variant === 'primary' ? BUTTON_FONT_STRONG : BUTTON_FONT
  if (item.type === 'text') return { size: item.size ?? 12, weight: item.weight ?? 500, family: item.font ?? 'ui' }
  if (item.type === 'chip') return { size: 12.5, weight: 500, family: 'ui' }
  if (item.type === 'handle') return { size: 11, weight: 600, family: 'ui' }
  return BUTTON_FONT
}

/** Natural width of an item (for 'auto' and fixed widths); null when it shares space by flex. */
function fixedWidth(item: Item, measure: Measure): number | null {
  if (item.type === 'logo') return item.size
  if (item.type === 'spacer') return item.width ?? null
  if (item.type === 'handle') return null
  const w = 'width' in item ? item.width : undefined
  if (typeof w === 'number') return w
  if (w !== 'auto') return null
  const font = itemFont(item)
  if (item.type === 'button') return Math.ceil(measure(item.label, font)) + BUTTON_PAD_X * 2 + 2
  if (item.type === 'chip') return Math.ceil(measure(item.text, font)) + 34
  return Math.ceil(measure(item.text, font))
}

function itemHeight(item: Item): number {
  if (item.type === 'button') return item.variant === 'tab' ? TAB_H : item.align === 'left' ? 40 : BUTTON_H
  if (item.type === 'text') return Math.ceil((item.size ?? 12) * LINE * (item.maxLines ?? 1))
  if (item.type === 'chip') return 30
  if (item.type === 'logo') return item.size
  if (item.type === 'handle') return 22
  return 0
}

/** Greedy word wrap into at most `maxLines`; the last line ends with … when text is cut. */
export function wrapText(text: string, width: number, font: FontSpec, measure: Measure, maxLines = 1): string[] {
  const lines: string[] = []
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  let i = 0
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (!line || measure(next, font) <= width) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && line) {
    lines.push(line)
    line = ''
  }
  const cut = lines.length === maxLines && (i < words.length || line !== '')
  return lines.map((l, n) => (n === lines.length - 1 ? fit(l, width, font, measure, cut) : fit(l, width, font, measure, false)))
}

/** Trim a single line to `width`, adding … when it was cut (or when `cut` says more text followed). */
export function fit(text: string, width: number, font: FontSpec, measure: Measure, cut = false): string {
  if (!cut && measure(text, font) <= width) return text
  let s = text
  while (s.length > 1 && measure(`${s}…`, font) > width) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

function layoutRow(row: Row, x: number, y: number, width: number, measure: Measure, nodes: Node[], hits: Hit[]): number {
  const gap = row.gap ?? 6
  const fixed = row.items.map((item) => fixedWidth(item, measure))
  const flexOf = (item: Item, i: number) => (fixed[i] === null ? ('flex' in item && item.flex ? item.flex : 1) : 0)
  const totalFixed = fixed.reduce<number>((s, w) => s + (w ?? 0), 0) + gap * Math.max(0, row.items.length - 1)
  const totalFlex = row.items.reduce((s, item, i) => s + flexOf(item, i), 0)
  const free = Math.max(0, width - totalFixed)
  const h = row.height ?? Math.max(0, ...row.items.map(itemHeight))
  let cx = x
  row.items.forEach((item, i) => {
    const w = fixed[i] ?? (totalFlex ? (free * flexOf(item, i)) / totalFlex : 0)
    const ih = item.type === 'text' || item.type === 'logo' ? itemHeight(item) : h
    const rect = { x: cx, y: y + (h - ih) / 2, w, h: ih }
    const font = itemFont(item)
    if (item.type === 'button') {
      nodes.push({ kind: 'button', rect, item, font, label: fit(item.label, w - BUTTON_PAD_X * 2, font, measure) })
      hits.push({ id: item.id, rect, disabled: !!item.disabled })
    } else if (item.type === 'text') {
      nodes.push({ kind: 'text', rect, item, font, lines: wrapText(item.text, w, font, measure, item.maxLines ?? 1) })
    } else if (item.type === 'chip') {
      nodes.push({ kind: 'chip', rect, item, font, label: fit(item.text, w - 34, font, measure) })
    } else if (item.type === 'logo') {
      nodes.push({ kind: 'logo', rect })
    } else if (item.type === 'handle') {
      nodes.push({ kind: 'handle', rect, item, font })
      hits.push({ id: item.id, rect, disabled: false, handle: true })
    }
    cx += w + gap
  })
  return h
}

function layoutGrid(grid: Grid, x: number, y: number, width: number, measure: Measure, nodes: Node[], hits: Hit[]): number {
  const gap = grid.gap ?? 6
  const rowH = grid.rowHeight ?? 40
  const colW = (width - gap * (grid.columns - 1)) / grid.columns
  grid.items.forEach((item, i) => {
    const rect = { x: x + (i % grid.columns) * (colW + gap), y: y + Math.floor(i / grid.columns) * (rowH + gap), w: colW, h: rowH }
    const align = item.align ?? 'left'
    const font = itemFont({ ...item, align })
    nodes.push({ kind: 'button', rect, item: { ...item, align }, font, label: fit(item.label, colW - (align === 'left' ? 24 : 12), font, measure) })
    hits.push({ id: item.id, rect, disabled: !!item.disabled })
  })
  const rows = Math.ceil(grid.items.length / grid.columns)
  return rows ? rows * rowH + (rows - 1) * gap : 0
}

export function layoutPanel(spec: PanelSpec, measure: Measure): PanelLayout {
  const nodes: Node[] = []
  const hits: Hit[] = []
  const cardGap = spec.gap ?? 10
  let y = 0
  spec.cards.forEach((card, ci) => {
    const tone = card.tone ?? 'plain'
    const pad = card.padding ?? (tone === 'bare' ? 0 : 10)
    const gap = card.gap ?? 8
    const inner = spec.width - pad * 2
    const cardNode: Node = { kind: 'card', rect: { x: 0, y, w: spec.width, h: 0 }, tone }
    nodes.push(cardNode)
    let cy = y + pad
    card.blocks.forEach((block, bi) => {
      if (bi) cy += gap
      cy += block.type === 'row' ? layoutRow(block, pad, cy, inner, measure, nodes, hits) : layoutGrid(block, pad, cy, inner, measure, nodes, hits)
    })
    cardNode.rect.h = cy + pad - y
    y = cy + pad + (ci < spec.cards.length - 1 ? cardGap : 0)
  })
  return { width: spec.width, height: Math.ceil(y), nodes, hits }
}

/** The enabled or disabled control under a point (CSS px from the panel's top-left), or null. */
export function hitTest(layout: PanelLayout, x: number, y: number): Hit | null {
  for (let i = layout.hits.length - 1; i >= 0; i--) {
    const h = layout.hits[i]
    if (x >= h.rect.x && x <= h.rect.x + h.rect.w && y >= h.rect.y && y <= h.rect.y + h.rect.h) return h
  }
  return null
}
