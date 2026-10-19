import { Component, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { XRPanel } from './panel/XRPanel'
import type { PanelSpec } from './panel/layout'
import { exitXR } from './session'

/** The fallback panel's content (pure, so it is unit-tested). */
export function errorPanelSpec(what: string, message: string): PanelSpec {
  return {
    width: 460,
    cards: [
      {
        type: 'card',
        tone: 'brand',
        gap: 10,
        blocks: [
          { type: 'row', items: [{ type: 'text', text: `The ${what} hit a problem`, font: 'display', size: 17, weight: 800, flex: 1 }] },
          { type: 'row', items: [{ type: 'text', text: message, size: 12, color: 'muted', maxLines: 3, flex: 1 }] },
          {
            type: 'row',
            items: [
              { type: 'button', id: 'retry', label: 'Try again', variant: 'primary' },
              { type: 'button', id: 'exit', label: 'Exit VR' },
              { type: 'button', id: 'reload', label: 'Reload' },
            ],
          },
        ],
      },
    ],
  }
}

/**
 * Keeps one broken XR menu from taking the headset view down with it. A render error inside shows a small
 * panel in its place (Try again / Exit VR / Reload) instead of unmounting the whole scene, and is logged
 * (the dev server prints headset errors via tools/client-log.ts).
 */
export class XRErrorBoundary extends Component<{ what: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[RealmForge] XR ${this.props.what} crashed`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const onPress = (id: string) => {
      if (id === 'retry') this.setState({ error: null })
      else if (id === 'exit') void exitXR()
      else if (id === 'reload') window.location.reload()
    }
    return (
      <InFrontOfYou>
        <XRPanel name={`error:${this.props.what}`} spec={errorPanelSpec(this.props.what, this.state.error.message || 'Unknown error')} onPress={onPress} />
      </InFrontOfYou>
    )
  }
}

const head = new THREE.Vector3()
const look = new THREE.Vector3()

/** Placed 0.7 m in front of your head (level, slightly above eye height) when it first appears. */
function InFrontOfYou({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const placed = useRef(false)
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    const g = group.current
    if (!g || placed.current) return
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(head)
    camera.getWorldDirection(look)
    look.y = 0
    if (look.lengthSq() < 1e-6) look.set(0, 0, -1)
    look.normalize()
    g.position.copy(head).addScaledVector(look, 0.7)
    g.position.y += 0.15
    g.rotation.set(0, Math.atan2(-look.x, -look.z), 0)
    placed.current = true
  })
  return <group ref={group}>{children}</group>
}
