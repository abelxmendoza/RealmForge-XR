import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { FORGE } from '../theme/forge'
import { GUIDE_SECTIONS, getGuideSection, nextGuideSection, prevGuideSection } from '../guide/controlsGuide'
import { useGuide } from '../guide/guideStore'

/**
 * Immersive user guide — same sections as the desktop modal.
 * Placed in tracking space (independent of world scale). Open via wrist "Guide"
 * or the control palette; Close returns to building.
 */
export function ControlsGuidePanel() {
  const session = useXR((s) => s.session)
  const open = useGuide((s) => s.open)
  if (!session || !open) return null
  return <GuideContent />
}

function GuideContent() {
  const root = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const sectionId = useGuide((s) => s.section)
  const setSection = useGuide((s) => s.setSection)
  const closeGuide = useGuide((s) => s.closeGuide)
  const section = getGuideSection(sectionId)
  const positioned = useRef(false)
  const vectors = useMemo(
    () => ({
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      yaw: new THREE.Quaternion(),
      euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    }),
    [],
  )

  // Place in front of the user on open; Recenter resets this flag.
  useEffect(() => {
    positioned.current = false
  }, [sectionId])

  useFrame(() => {
    if (!root.current || positioned.current) return
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(vectors.position)
    camera.getWorldQuaternion(vectors.yaw)
    vectors.euler.setFromQuaternion(vectors.yaw, 'YXZ')
    vectors.yaw.setFromEuler(new THREE.Euler(0, vectors.euler.y, 0))
    // Slightly right of center, comfortable reading distance.
    vectors.direction.set(0.15, -0.05, -1.15).applyQuaternion(vectors.yaw)
    root.current.position.copy(vectors.position).add(vectors.direction)
    root.current.quaternion.copy(vectors.yaw)
    positioned.current = true
  })

  return (
    <group ref={root} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <GuideTile text="User & controls guide" y={0.34} width={0.72} height={0.055} accent />
      <GuideTile text={section.title} y={0.28} width={0.72} height={0.045} />
      {GUIDE_SECTIONS.map((s, i) => (
        <GuideTile
          key={s.id}
          text={s.tab}
          x={(i - (GUIDE_SECTIONS.length - 1) / 2) * 0.1}
          y={0.22}
          width={0.092}
          height={0.038}
          active={s.id === sectionId}
          onClick={() => setSection(s.id)}
        />
      ))}
      <GuideTile text={section.lines.join('\n')} y={0.0} width={0.72} height={0.36} align="left" />
      <GuideTile text="← Prev" x={-0.24} y={-0.24} width={0.2} onClick={() => setSection(prevGuideSection(sectionId))} />
      <GuideTile text="Next →" x={0.0} y={-0.24} width={0.2} active onClick={() => setSection(nextGuideSection(sectionId))} />
      <GuideTile text="Close guide" x={0.24} y={-0.24} width={0.2} onClick={closeGuide} />
      <GuideTile text="Recenter" y={-0.3} width={0.72} height={0.04} onClick={() => { positioned.current = false }} />
    </group>
  )
}

function GuideTile({
  text,
  x = 0,
  y,
  width,
  height = 0.055,
  active = false,
  accent = false,
  align = 'center',
  onClick,
}: {
  text: string
  x?: number
  y: number
  width: number
  height?: number
  active?: boolean
  accent?: boolean
  align?: 'center' | 'left'
  onClick?: () => void
}) {
  const [hover, setHover] = useState(false)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = Math.max(128, Math.round(1024 * (height / width)))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = active || accent ? FORGE.emberActive : hover && onClick ? FORGE.hover : FORGE.panelMuted
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = active || accent ? FORGE.emberHot : FORGE.emberDeep
    ctx.fillRect(0, 0, canvas.width, Math.max(6, Math.round(canvas.height * 0.05)))
    ctx.strokeStyle = active || accent ? FORGE.emberHot : FORGE.lineSoft
    ctx.lineWidth = 5
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
    ctx.fillStyle = FORGE.text
    const base = Math.round(1024 * (align === 'left' ? 0.014 : 0.016) / width)
    ctx.font = `600 ${base}px "Sora", "Segoe UI", sans-serif`
    ctx.textAlign = align === 'left' ? 'left' : 'center'
    ctx.textBaseline = 'middle'
    const paragraphs = text.split('\n')
    const lines: string[] = []
    const maxW = align === 'left' ? 920 : 940
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/)
      let line = ''
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (line && ctx.measureText(candidate).width > maxW) {
          lines.push(line)
          line = word
        } else line = candidate
      }
      if (line) lines.push(line)
    }
    const startY = canvas.height / 2 - ((lines.length - 1) * base * 1.35) / 2
    const xPos = align === 'left' ? 52 : 512
    lines.forEach((value, i) => {
      ctx.fillText(value, xPos, startY + i * base * 1.35, maxW)
    })
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [text, height, width, active, accent, hover, onClick != null, align])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh
      position={[x, y, 0]}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
      onPointerDown={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
