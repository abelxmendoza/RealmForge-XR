import { HUD } from '../../theme/forge'
import type { FontSpec, Measure, Node, PanelLayout, Rect } from './layout'

/** What changes between repaints without changing the layout. */
export interface PaintState {
  hover: ReadonlySet<string>
  /** The control pressed a moment ago (drawn sunk for feedback). */
  pressed: string | null
  /** Grab strip: being held. */
  held: boolean
  logo: CanvasImageSource | null
}

/** The subset of CanvasRenderingContext2D used here (so tests can pass a recorder). */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'scale' | 'clearRect' | 'beginPath' | 'roundRect' | 'fill' | 'stroke' | 'fillText' | 'measureText'
  | 'createLinearGradient' | 'drawImage' | 'arc' | 'rect' | 'clip'
> & {
  fillStyle: CanvasRenderingContext2D['fillStyle']
  strokeStyle: CanvasRenderingContext2D['strokeStyle']
  lineWidth: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  globalAlpha: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetY: number
}

export const cssFont = (f: FontSpec) => `${f.weight} ${f.size}px ${f.family === 'display' ? HUD.fontDisplay : HUD.font}`

/** A Measure backed by a canvas context (layout runs in CSS px, the same units as the font sizes). */
export function canvasMeasure(ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>): Measure {
  const cache = new Map<string, number>()
  return (text, font) => {
    const f = cssFont(font)
    const key = `${f}|${text}`
    let w = cache.get(key)
    if (w === undefined) {
      ctx.font = f
      w = ctx.measureText(text).width
      if (cache.size > 2000) cache.clear()
      cache.set(key, w)
    }
    return w
  }
}

function round(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(radius, r.h / 2, r.w / 2))
}

const TEXT_COLOR = { text: HUD.text, muted: HUD.muted, faint: HUD.faint, copper: HUD.copper, live: HUD.live, warn: HUD.warn } as const

function paintCard(ctx: Ctx, node: Extract<Node, { kind: 'card' }>) {
  if (node.tone === 'bare') return
  const r = node.rect
  ctx.save()
  // .hud-panel: soft drop shadow, translucent slate, 1px warm line, 12px corners.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  round(ctx, r, HUD.radius)
  ctx.fillStyle = HUD.panel
  ctx.fill()
  ctx.restore()
  if (node.tone === 'brand') {
    // .hud-brand: linear-gradient(135deg, ember 14%, transparent 42%).
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w * 0.42, r.y + r.h)
    g.addColorStop(0, HUD.panelBrandGlow)
    g.addColorStop(1, 'rgba(224, 120, 69, 0)')
    round(ctx, r, HUD.radius)
    ctx.fillStyle = g
    ctx.fill()
  }
  round(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, HUD.radius)
  ctx.strokeStyle = HUD.line
  ctx.lineWidth = 1
  ctx.stroke()
}

function paintButton(ctx: Ctx, node: Extract<Node, { kind: 'button' }>, state: PaintState) {
  const { item, font, label } = node
  const hover = state.hover.has(item.id) && !item.disabled
  const pressed = state.pressed === item.id
  const v = item.variant ?? 'default'
  // :active → translateY(1px) scale(0.98)
  const r = pressed ? { x: node.rect.x + node.rect.w * 0.01, y: node.rect.y + 1 + node.rect.h * 0.01, w: node.rect.w * 0.98, h: node.rect.h * 0.98 } : node.rect
  ctx.save()
  if (item.disabled) ctx.globalAlpha = HUD.disabledOpacity
  let color: string = hover ? HUD.textHover : HUD.text
  if (v === 'on' || v === 'primary') {
    ctx.save()
    ctx.shadowColor = HUD.onGlow
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 6
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
    g.addColorStop(0, v === 'on' ? HUD.onTop : HUD.primaryTop)
    g.addColorStop(1, v === 'on' ? HUD.onBottom : HUD.primaryBottom)
    round(ctx, r, HUD.radiusSm)
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
    if (hover) {
      round(ctx, r, HUD.radiusSm)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.fill()
    }
    color = HUD.onText
  } else {
    round(ctx, r, HUD.radiusSm)
    ctx.fillStyle = v === 'danger' && hover ? HUD.dangerHover : hover ? HUD.buttonHover : HUD.button
    ctx.fill()
    round(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, HUD.radiusSm)
    ctx.strokeStyle = v === 'danger' ? HUD.dangerLine : hover ? HUD.lineStrong : HUD.line
    ctx.lineWidth = 1
    ctx.stroke()
    if (v === 'danger') color = HUD.dangerText
  }
  ctx.fillStyle = color
  ctx.font = cssFont(font)
  ctx.textBaseline = 'middle'
  const left = item.align === 'left'
  ctx.textAlign = left ? 'left' : 'center'
  ctx.fillText(label, left ? r.x + 12 : r.x + r.w / 2, r.y + r.h / 2 + 0.5)
  ctx.restore()
}

function paintText(ctx: Ctx, node: Extract<Node, { kind: 'text' }>) {
  const { item, font, lines, rect } = node
  ctx.save()
  ctx.fillStyle = TEXT_COLOR[item.color ?? 'text']
  ctx.font = cssFont(font)
  ctx.textBaseline = 'middle'
  const align = item.align ?? 'left'
  ctx.textAlign = align
  const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2
  const lh = font.size * 1.35
  lines.forEach((line, i) => ctx.fillText(line, x, rect.y + lh * (i + 0.5)))
  ctx.restore()
}

function paintChip(ctx: Ctx, node: Extract<Node, { kind: 'chip' }>) {
  const { rect: r, item, font, label } = node
  ctx.save()
  // The HUD status pill: dark capsule, coloured dot, text.
  round(ctx, r, r.h / 2)
  ctx.fillStyle = HUD.chip
  ctx.fill()
  round(ctx, { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 }, r.h / 2)
  ctx.strokeStyle = HUD.line
  ctx.lineWidth = 1
  ctx.stroke()
  const tone = item.tone ?? 'idle'
  ctx.beginPath()
  ctx.arc(r.x + 15, r.y + r.h / 2, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = tone === 'live' ? HUD.live : tone === 'warn' ? HUD.warn : HUD.faint
  ctx.fill()
  ctx.fillStyle = HUD.text
  ctx.font = cssFont(font)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, r.x + 26, r.y + r.h / 2 + 0.5)
  ctx.restore()
}

function paintHandle(ctx: Ctx, node: Extract<Node, { kind: 'handle' }>, state: PaintState) {
  const { rect: r, font } = node
  const hover = state.hover.has(node.item.id)
  ctx.save()
  round(ctx, r, r.h / 2)
  ctx.fillStyle = state.held ? 'rgba(224, 120, 69, 0.55)' : hover ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)'
  ctx.fill()
  // Grip dots on the left, like a drag handle.
  ctx.fillStyle = state.held || hover ? HUD.text : HUD.faint
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    ctx.beginPath()
    ctx.arc(r.x + 14 + i * 5, r.y + r.h / 2 - 2.5 + j * 5, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = cssFont(font)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = state.held ? HUD.text : HUD.muted
  ctx.fillText(state.held ? 'Moving… release to place' : node.item.label, r.x + r.w / 2, r.y + r.h / 2 + 0.5)
  ctx.restore()
}

function paintLogo(ctx: Ctx, node: Extract<Node, { kind: 'logo' }>, logo: CanvasImageSource | null) {
  const r = node.rect
  ctx.save()
  round(ctx, r, 6)
  ctx.clip()
  if (logo) ctx.drawImage(logo, r.x, r.y, r.w, r.h)
  else {
    // .hud-logo-mark fallback until the image loads.
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h)
    g.addColorStop(0, HUD.primaryTop)
    g.addColorStop(1, '#b84f28')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.fill()
  }
  ctx.restore()
}

/** Paint `layout` at `scale` device px per CSS px. Transparent between cards, like the HUD over the world. */
export function drawPanel(ctx: Ctx, layout: PanelLayout, state: PaintState, scale: number) {
  ctx.save()
  ctx.clearRect(0, 0, layout.width * scale, layout.height * scale)
  ctx.scale(scale, scale)
  for (const node of layout.nodes) {
    if (node.kind === 'card') paintCard(ctx, node)
    else if (node.kind === 'button') paintButton(ctx, node, state)
    else if (node.kind === 'text') paintText(ctx, node)
    else if (node.kind === 'chip') paintChip(ctx, node)
    else if (node.kind === 'handle') paintHandle(ctx, node, state)
    else paintLogo(ctx, node, state.logo)
  }
  ctx.restore()
}
