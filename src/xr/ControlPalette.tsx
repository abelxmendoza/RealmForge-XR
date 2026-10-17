import { ACTOR_CATALOG, ACTOR_KINDS } from '../actors/types'
import { actorRuntimeRevision, subscribeActorRuntime, getActorRuntime } from '../actors/runtime'
import { requestConfirmation } from '../world/confirmation'
import { ASSETS, getAsset } from '../world/assets'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { worldActions } from '../world/actions'
import { useWorld } from '../world/store'
import { getHistoryState, subscribeHistory } from '../world/history'
import { getConfirmation, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'
import { useWorldLibrary } from '../world/persistence'
import { BUILDING_STYLE_IDS, WALL_MATERIALS, PLATFORM_MATERIALS, TREE_STYLES } from '../world/catalog'
import { useEditor } from '../editor/settings'
import { useNav } from '../nav/navigation'
import { toggleRays } from '../editor/xrInput'
import { blockRoute } from '../editor/demo'
import { usePlacement } from './placement'
import { blankPaletteWorld, createPaletteWorld, deletePaletteSelection, editPaletteSelection, loadPaletteEnvironment, loadPaletteSave, savePaletteWorld } from './paletteActions'
import { FORGE } from '../theme/forge'
import { useGuide } from '../guide/guideStore'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { VOICE_OPTIONS } from '../voice/sharedConfirm'

/** Actual Three.js controls: visible to both eyes and interactive with XR pointers. */
export function ControlPalette() {
  const session = useXR((s) => s.session)
  return session ? <PaletteContent /> : null
}

type Button = { label: string; run: () => unknown; active?: boolean; disabled?: boolean }
function PaletteContent() {
  const root = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const [page, setPage] = useState('Tools')
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Point and trigger / pinch to choose. Open Guide anytime.')
  const guideOpen = useGuide((s) => s.open)
  const openGuide = useGuide((s) => s.openGuide)
  const closeGuide = useGuide((s) => s.closeGuide)
  const voice = useVoiceCommands(VOICE_OPTIONS)
  // Show what voice heard and did on the palette's message line.
  useEffect(() => {
    if (voice.lastError) setMessage(`Voice: ${voice.lastError}`)
    else if (voice.lastResult && 'message' in voice.lastResult) setMessage(`Voice: ${voice.lastResult.message}`)
    else if (voice.lastTranscript) setMessage(`Heard: "${voice.lastTranscript}"`)
  }, [voice.lastTranscript, voice.lastResult, voice.lastError])
  const [savePage, setSavePage] = useState(0)
  const [assetPage, setAssetPage] = useState(0)
  const [destinationPage, setDestinationPage] = useState(0)
  const [history, setHistory] = useState(getHistoryState)
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation)
  const tool = useWorld((s) => s.tool)
  const objects = useWorld((s) => s.objects)
  const selected = useWorld((s) => s.selectedId ? s.objects[s.selectedId] : null)
  const actors = useWorld((s) => s.actors)
  const selectedActorId = useWorld((s) => s.selectedActorId)
  const actor = selectedActorId ? actors[selectedActorId] : undefined
  useSyncExternalStore(subscribeActorRuntime, actorRuntimeRevision, actorRuntimeRevision)
  const cycleActor = () => {
    const ids = [null, ...Object.keys(actors)]
    worldActions.selectActor(ids[(ids.indexOf(selectedActorId) + 1) % ids.length])
    worldActions.setTool('select')
  }
  const deleteActor = async () => {
    if (actor && await requestConfirmation({ type: 'DELETE', message: 'Delete ' + actor.name + '?' })) worldActions.removeActor(actor.id)
  }
  const editor = useEditor()
  const snap = editor.snap
  const inAR = useXR((s) => s.mode === 'immersive-ar')
  const status = useNav((s) => s.status)
  const saves = useWorldLibrary((s) => s.worlds)
  const activeName = useWorldLibrary((s) => s.activeName)
  const positioned = useRef(false)
  const vectors = useMemo(() => ({ position: new THREE.Vector3(), direction: new THREE.Vector3(), yaw: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ') }), [])

  useEffect(() => subscribeHistory(setHistory), [])
  useEffect(() => { if (request) setHidden(false) }, [request])
  useEffect(() => { worldActions.listSavedWorlds() }, [])
  // Place once in tracking space, independent of the tabletop and its scale.
  useFrame(() => {
    if (!root.current || positioned.current) return
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(vectors.position)
    camera.getWorldQuaternion(vectors.yaw)
    vectors.euler.setFromQuaternion(vectors.yaw, 'YXZ')
    vectors.yaw.setFromEuler(new THREE.Euler(0, vectors.euler.y, 0))
    vectors.direction.set(-0.55, -0.08, -1.05).applyQuaternion(vectors.yaw)
    root.current.position.copy(vectors.position).add(vectors.direction)
    root.current.quaternion.copy(vectors.yaw)
    positioned.current = true
  })

  const run = async (button: Button) => {
    if (busy || button.disabled) return
    setBusy(true)
    try {
      const result = await button.run() as { ok?: boolean; error?: string; cancelled?: boolean } | undefined
      setMessage(result?.ok === false ? result.error || 'Action cancelled.' : `${button.label} done.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action failed.') }
    finally { setBusy(false) }
  }

  let buttons: Button[] = []
  if (page === 'Tools') {
    buttons = ([['select', 'Select / move'], ['building', 'Building'], ['wall', 'Wall'], ['platform', 'Road / platform'], ['decor', 'Decoration'], ['robot', 'Place robot'], ['goal', 'Set destination']] as const)
      .map(([id, label]) => ({ label, active: tool === id, run: () => worldActions.setTool(id) }))
    buttons.push({ label: snap ? 'Snap: on' : 'Snap: off', active: snap, run: () => useEditor.getState().set({ snap: !snap }) },
      { label: 'Block robot route', run: blockRoute },
      { label: 'Place world (AR)', disabled: !inAR, run: () => usePlacement.getState().startChoosing() })
  } else if (page === 'Worlds') {
    buttons = worldActions.listEnvironments().map((env) => ({ label: env.name, run: () => loadPaletteEnvironment(env.id) }))
    buttons.push({ label: 'New world (saved)', run: () => createPaletteWorld() }, { label: 'Blank world', run: blankPaletteWorld }, { label: 'Save world', run: savePaletteWorld },
      { label: 'Save as new', run: () => worldActions.saveWorld(activeName) },
      { label: 'Browse saved worlds', run: () => { worldActions.listSavedWorlds(); setSavePage(0); setPage('Saved') } })
  } else if (page === 'Assets') {
    const offset = Math.min(assetPage, Math.ceil(ASSETS.length / 6) - 1)
    buttons = ASSETS.slice(offset * 6, offset * 6 + 6).map((asset) => ({ label: asset.name, active: tool === 'asset' && editor.assetId === asset.id, run: () => { worldActions.selectCatalogAsset(asset.id); setMessage('Aim at ground: green places, red is blocked.') } }))
    buttons.push({ label: 'Rotate −90°', run: () => worldActions.rotateCatalogAsset(-1) }, { label: 'Rotate +90°', run: () => worldActions.rotateCatalogAsset(1) },
      { label: 'Previous objects', disabled: offset === 0, run: () => setAssetPage(offset - 1) }, { label: 'More objects', disabled: (offset + 1) * 6 >= ASSETS.length, run: () => setAssetPage(offset + 1) })
  } else if (page === 'Actors') {
    buttons = ACTOR_KINDS.map((kind) => ({ label: 'Place ' + ACTOR_CATALOG[kind].name, active: tool === 'actor' && editor.actorKind === kind, run: () => worldActions.selectActorKind(kind) }))
    buttons.push(
      { label: 'Next actor / original robot', run: cycleActor },
      { label: 'Actor settings', disabled: !actor, run: () => setPage('Actor settings') },
      { label: 'Set actor destination', disabled: !actor, run: () => worldActions.setTool('goal') },
      { label: 'Stop actor', disabled: !actor, run: () => actor && worldActions.setActorGoal(actor.id, null) },
      { label: 'Duplicate actor', disabled: !actor, run: () => actor && worldActions.duplicateActor(actor.id) },
      { label: 'Delete actor', disabled: !actor, run: deleteActor })
  } else if (page === 'Actor settings') {
    const colors = ['#ffb86b', '#65cdd0', '#a7bd72', '#b98de0', '#ed7185', '#eeeeee']
    buttons = [
      { label: 'Next actor', run: cycleActor },
      { label: 'Cycle color', disabled: !actor, run: () => actor && worldActions.updateActor(actor.id, { color: colors[(colors.indexOf(actor.color) + 1) % colors.length] }) },
      ...[-0.2, 0.2].map((delta) => ({ label: delta < 0 ? 'Slower' : 'Faster', disabled: !actor, run: () => actor && worldActions.updateActor(actor.id, { speed: Math.max(0.1, Math.min(8, actor.speed + delta)) }) })),
      ...[0.9, 1.1].map((scale) => ({ label: scale < 1 ? 'Smaller' : 'Larger', disabled: !actor, run: () => actor && worldActions.updateActor(actor.id, { size: actor.size.map((v) => Math.max(0.3, Math.min(8, v * scale))) as [number, number, number] }) })),
      { label: 'Duplicate actor', disabled: !actor, run: () => actor && worldActions.duplicateActor(actor.id) },
      { label: 'Delete actor', disabled: !actor, run: deleteActor },
      { label: 'Back to actors', run: () => setPage('Actors') }]
  } else if (page === 'Routes') {
    const destinations = Object.values(objects).filter((object) => object.destinationRole)
    const offset = Math.min(destinationPage, Math.max(0, Math.ceil(destinations.length / 6) - 1))
    buttons = destinations.slice(offset * 6, offset * 6 + 6).map((object, i) => ({ label: `Go: ${getAsset(object.assetId || '')?.name || object.destinationRole} ${offset * 6 + i + 1}`, run: () => worldActions.sendRobotToDestination(object.id) }))
    buttons.push({ label: 'Previous markers', disabled: offset === 0, run: () => setDestinationPage(offset - 1) }, { label: 'More markers', disabled: (offset + 1) * 6 >= destinations.length, run: () => setDestinationPage(offset + 1) })
  } else if (page === 'Brush') {
    const next = <T extends string,>(values: readonly T[], value: T): T => values[(values.indexOf(value) + 1) % values.length]
    buttons = [
      { label: `Building: ${editor.buildingStyle}`, run: () => editor.set({ buildingStyle: next(BUILDING_STYLE_IDS, editor.buildingStyle) }) },
      { label: `Wall: ${editor.wallMaterial}`, run: () => editor.set({ wallMaterial: next(WALL_MATERIALS, editor.wallMaterial) }) },
      { label: `Platform: ${editor.platformMaterial}`, run: () => editor.set({ platformMaterial: next(PLATFORM_MATERIALS, editor.platformMaterial) }) },
      { label: `Roof: ${editor.roof}`, run: () => editor.set({ roof: editor.roof === 'flat' ? 'pitched' : 'flat' }) },
      { label: `Decoration: ${editor.decor}`, run: () => editor.set({ decor: next(['tree', 'streetlight', 'crate'] as const, editor.decor) }) },
      { label: `Tree: ${editor.treeStyle}`, run: () => editor.set({ treeStyle: next(TREE_STYLES, editor.treeStyle) }) },
    ]
  } else if (page === 'Saved') {
    const offset = Math.min(savePage, Math.max(0, Math.ceil(saves.length / 6) - 1))
    buttons = saves.slice(offset * 6, offset * 6 + 6).map((save) => ({ label: save.name, run: () => loadPaletteSave(save.id) }))
    buttons.push({ label: 'Previous saves', disabled: offset === 0, run: () => setSavePage(offset - 1) },
      { label: 'Next saves', disabled: (offset + 1) * 6 >= saves.length, run: () => setSavePage(offset + 1) })
  } else {
    buttons = ([['rotate-left', 'Rotate -15°'], ['rotate-right', 'Rotate +15°'], ['grow', 'Wider / deeper'], ['shrink', 'Narrower'], ['raise', 'Taller'], ['lower', 'Shorter'], ['style', 'Material / style'], ['roof', 'Toggle roof'], ['duplicate', 'Duplicate']] as const)
      .map(([action, label]) => ({ label: action === 'style' && selected?.assetId ? 'Cycle color' : label, disabled: !selected || action === 'roof' && !!selected.assetId, run: () => editPaletteSelection(action) }))
    buttons.push({ label: 'Delete selected', disabled: !selected, run: deletePaletteSelection })
  }

  return <group ref={root} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
    <Tile
      text={voice.isListening ? `Listening… ${voice.lastPartial ? `"${voice.lastPartial}" · ` : ''}tap to run` : 'Voice command: tap to talk'}
      y={0.39}
      width={0.65}
      height={0.065}
      active={voice.isListening}
      onClick={() => void (voice.isListening ? voice.stopListening() : voice.startListening())}
    />
    <Tile text={hidden ? 'Show controls' : 'RealmForge controls'} y={0.32} width={0.65} height={0.065} onClick={() => { if (!request) setHidden(!hidden) }} />
    {!hidden && <>
      <Tile text={`${actor ? getActorRuntime(actor.id)?.status || 'idle' : status} · ${actor ? actor.name : selected ? (getAsset(selected.assetId || '')?.name || selected.kind) : 'no selection'}`} x={-0.11} y={0.267} height={0.035} width={0.43} />
      <Tile text={editor.rays ? 'Rays: on' : 'Rays: off'} x={0.22} y={0.267} height={0.035} width={0.21} active={editor.rays} onClick={toggleRays} />
      {request ? <>
        <Tile text={request.message} y={0.08} height={0.29} width={0.65} />
        <Tile text="Cancel" x={-0.165} y={-0.12} width={0.31} onClick={() => resolveConfirmation(request.id, false)} />
        <Tile text="Confirm" x={0.165} y={-0.12} width={0.31} active onClick={() => resolveConfirmation(request.id, true)} />
      </> : <>
        {['Tools', 'Worlds', 'Edit', 'Brush', 'Assets', 'Routes', 'Actors'].map((tab, i) => <Tile key={tab} text={tab} x={(i - 3) * 0.094} y={0.21} width={0.089} active={page === tab || tab === 'Actors' && page === 'Actor settings' || tab === 'Worlds' && page === 'Saved'} onClick={() => setPage(tab)} />)}
        {buttons.map((button, i) => <Tile key={page + button.label} text={button.label} x={i % 2 ? 0.165 : -0.165} y={0.135 - Math.floor(i / 2) * 0.07} width={0.31} disabled={busy || button.disabled} active={button.active} onClick={() => void run(button)} />)}
        <Tile text="Undo" x={-0.24} y={-0.235} width={0.15} disabled={busy || !history.canUndo} onClick={() => worldActions.undo()} />
        <Tile text="Redo" x={-0.08} y={-0.235} width={0.15} disabled={busy || !history.canRedo} onClick={() => worldActions.redo()} />
        <Tile text={guideOpen ? 'Close guide' : 'Guide'} x={0.08} y={-0.235} width={0.15} active={guideOpen} onClick={() => (guideOpen ? closeGuide() : openGuide('start'))} />
        <Tile text="Recenter" x={0.24} y={-0.235} width={0.15} onClick={() => { positioned.current = false }} />
        <Tile text={busy ? 'Working…' : page === 'Assets' ? `${getAsset(editor.assetId)?.name} · ${Math.round(editor.assetRotation * 180 / Math.PI)}° · Aim at clear ground.` : message} y={-0.31} width={0.65} height={0.065} />
      </>}
    </>}
  </group>
}

/** Canvas labels avoid network fonts and HTML overlays, which disappear in immersive XR. */
function Tile({ text, x = 0, y, width, height = 0.06, active = false, disabled = false, onClick }: {
  text: string; x?: number; y: number; width: number; height?: number; active?: boolean; disabled?: boolean; onClick?: () => void
}) {
  const [hover, setHover] = useState(false)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = Math.round(1024 * height / width)
    const context = canvas.getContext('2d')!
    context.fillStyle = disabled ? FORGE.panelDisabled : active ? FORGE.emberActive : hover && onClick ? FORGE.hover : FORGE.panelMuted
    context.fillRect(0, 0, canvas.width, canvas.height)
    // Ember accent bar — matches desktop brand mark in immersive space.
    context.fillStyle = active ? FORGE.emberHot : FORGE.emberDeep
    context.fillRect(0, 0, canvas.width, Math.max(6, Math.round(canvas.height * 0.06)))
    context.strokeStyle = active ? FORGE.emberHot : FORGE.lineSoft
    context.lineWidth = 5
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
    context.fillStyle = disabled ? FORGE.textMuted : FORGE.text
    const font = Math.round(1024 * 0.018 / width)
    context.font = `600 ${font}px "Sora", "Segoe UI", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const words = text.split(/\s+/); const lines: string[] = []; let line = ''
    for (const word of words) { const candidate = line ? line + ' ' + word : word; if (line && context.measureText(candidate).width > 940) { lines.push(line); line = word } else line = candidate }
    if (line) lines.push(line)
    lines.forEach((value, i) => context.fillText(value, 512, canvas.height / 2 + (i - (lines.length - 1) / 2) * font * 1.3, 940))
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [text, height, width, active, disabled, hover, onClick != null])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={[x, y, 0]} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)} onPointerDown={(e) => { e.stopPropagation(); if (!disabled) onClick?.() }} onClick={(e) => e.stopPropagation()}>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
  </mesh>
}
