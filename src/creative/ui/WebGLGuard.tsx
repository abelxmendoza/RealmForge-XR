import { Component, type ReactNode } from 'react'

let cached: boolean | null = null
/** Whether this browser can create a WebGL context (cached; disabled GPUs / sandboxes return false). */
export function hasWebGL(): boolean {
  if (cached !== null) return cached
  try {
    const c = document.createElement('canvas')
    cached = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    cached = false
  }
  return cached
}

const Fallback = ({ what }: { what: string }) => (
  <p className="cs-overlay cs-error" role="alert">{what} needs WebGL, which this browser has disabled. The rest of the studio still works.</p>
)

/** Keeps a WebGL failure inside the 3D area instead of unmounting the whole studio. */
export class WebGLGuard extends Component<{ what: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: !hasWebGL() }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn('[creative] 3D view failed', e) }
  render() { return this.state.failed ? <Fallback what={this.props.what} /> : this.props.children }
}
