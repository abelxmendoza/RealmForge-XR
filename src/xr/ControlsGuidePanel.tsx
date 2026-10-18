import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { GUIDE_SECTIONS, getGuideSection, nextGuideSection, prevGuideSection, type GuideSectionId } from '../guide/controlsGuide'
import { useGuide } from '../guide/guideStore'
import type { PanelSpec } from './panel/layout'
import { XRPanel } from './panel/XRPanel'
import { paletteAnchor, usePaletteUI } from './paletteUI'
import { faceYaw } from './panel/faceYaw'
import { METERS_PER_PX } from './panel/constants'
import { PALETTE_WIDTH } from './paletteModel'

const GUIDE_WIDTH_PX = 520
/** Palette centre to guide centre: half of each panel plus a 6 cm gap. */
const GUIDE_GAP_M = ((PALETTE_WIDTH + GUIDE_WIDTH_PX) / 2) * METERS_PER_PX + 0.06

/**
 * Immersive user guide: the same sections as the desktop modal, styled like the HUD. Open it from the wrist,
 * the palette or by voice ("open the guide"); Collapse folds it to its title bar, Close (or "hide the guide")
 * puts it away. It stays where you move it until Recenter.
 */
export function ControlsGuidePanel() {
  const session = useXR((s) => s.session)
  const open = useGuide((s) => s.open)
  if (!session || !open) return null
  return <GuideContent />
}

/** The guide panel's content (pure, so it is unit-tested). */
export function guideSpec(sectionId: GuideSectionId, collapsed: boolean): PanelSpec {
  const section = getGuideSection(sectionId)
  const title: PanelSpec['cards'][number] = {
    type: 'card',
    tone: 'brand',
    blocks: [
      { type: 'row', items: [{ type: 'handle', id: 'move', label: 'Move: grab here, or point and pull' }] },
      {
        type: 'row',
        items: [
          { type: 'logo', size: 22 },
          { type: 'text', text: 'User & controls guide', font: 'display', size: 17, weight: 800, flex: 1 },
          { type: 'button', id: 'collapse', label: collapsed ? 'Expand' : 'Collapse', width: 'auto' },
          { type: 'button', id: 'close', label: 'Close', width: 'auto' },
        ],
      },
    ],
  }
  if (collapsed) return { width: GUIDE_WIDTH_PX, cards: [title] }
  return {
    width: GUIDE_WIDTH_PX,
    cards: [
      title,
      {
        type: 'card',
        padding: 8,
        blocks: [
          {
            // Two rows of five: nine tabs in one row would cut their labels off.
            type: 'grid',
            columns: 5,
            rowHeight: 30,
            gap: 4,
            items: GUIDE_SECTIONS.map((s) => ({
              type: 'button' as const,
              id: `section:${s.id}`,
              label: s.tab,
              align: 'center' as const,
              variant: s.id === sectionId ? ('on' as const) : ('tab' as const),
            })),
          },
        ],
      },
      {
        type: 'card',
        gap: 6,
        blocks: [
          { type: 'row', items: [{ type: 'text', text: section.title, size: 14, weight: 600, color: 'copper', flex: 1 }] },
          ...section.lines.map((line) => ({ type: 'row' as const, items: [{ type: 'text' as const, text: line, size: 13, flex: 1 }] })),
        ],
      },
      {
        type: 'card',
        padding: 8,
        blocks: [
          {
            type: 'row',
            items: [
              { type: 'button', id: 'prev', label: '‹ Prev' },
              { type: 'button', id: 'next', label: 'Next ›', variant: 'primary' },
              { type: 'button', id: 'recenter', label: 'Recenter' },
            ],
          },
        ],
      },
    ],
  }
}

function GuideContent() {
  const root = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const sectionId = useGuide((s) => s.section)
  const [collapsed, setCollapsed] = useState(false)
  const positioned = useRef(false)
  const v = useMemo(() => ({ position: new THREE.Vector3(), direction: new THREE.Vector3(), yaw: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ') }), [])

  // Placed in front of you when opened; after that it stays where you moved it until Recenter.
  useFrame(() => {
    if (!root.current || positioned.current) return
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(v.position)
    camera.getWorldQuaternion(v.yaw)
    v.euler.setFromQuaternion(v.yaw, 'YXZ')
    v.yaw.setFromEuler(new THREE.Euler(0, v.euler.y, 0))
    const palette = usePaletteUI.getState()
    if (!palette.closed && paletteAnchor.placed) {
      // Right beside the palette, facing the same way, so the two never overlap wherever you're looking.
      const p = paletteAnchor.position
      const yaw = faceYaw([p.x, p.z], [v.position.x, v.position.z])
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
      root.current.position.copy(p).addScaledVector(right, GUIDE_GAP_M)
      root.current.rotation.set(0, yaw, 0)
    } else {
      v.direction.set(0.15, 0.22, -0.9).applyQuaternion(v.yaw)
      root.current.position.copy(v.position).add(v.direction)
      root.current.quaternion.copy(v.yaw)
    }
    positioned.current = true
  })

  const onPress = (id: string) => {
    const g = useGuide.getState()
    if (id === 'collapse') setCollapsed((c) => !c)
    else if (id === 'close') g.closeGuide()
    else if (id === 'prev') g.setSection(prevGuideSection(sectionId))
    else if (id === 'next') g.setSection(nextGuideSection(sectionId))
    else if (id === 'recenter') positioned.current = false
    else if (id.startsWith('section:')) g.setSection(id.slice('section:'.length) as GuideSectionId)
  }

  return (
    <group ref={root}>
      <XRPanel name="guide" spec={guideSpec(sectionId, collapsed)} onPress={onPress} moveTarget={root} />
    </group>
  )
}
