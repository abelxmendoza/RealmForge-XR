import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { actorRuntimeRevision, subscribeActorRuntime } from '../actors/runtime'
import { useEditor } from '../editor/settings'
import { useHudSection } from '../editor/hudSectionStore'
import { useFlow } from '../flow/store'
import { useGuide } from '../guide/guideStore'
import { useMocap } from '../mocap/store'
import { useNav } from '../nav/navigation'
import { useRoutePlan } from '../nav/routePlan'
import { useAttendee } from '../sim/attendee'
import { useScan } from '../scan/store'
import { useAssetLibrary } from '../world/assetLibrary'
import { getConfirmation, subscribeConfirmation } from '../world/confirmation'
import { subscribeHistory } from '../world/history'
import { useWorldLibrary } from '../world/persistence'
import { worldActions } from '../world/actions'
import { useWorld } from '../world/store'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { VOICE_OPTIONS } from '../voice/sharedConfirm'
import { XRPanel } from './panel/XRPanel'
import { buildPalette, readPaletteSnapshot, sectionOf, usePaletteOffsets } from './paletteModel'
import { currentPage, openPage, paletteAnchor, summonPalette, usePaletteUI } from './paletteUI'
import { usePlacement } from './placement'

/** The in-headset Control Palette: the desktop HUD's look and sections, as a floating panel. */
export function ControlPalette() {
  const session = useXR((s) => s.session)
  return session ? <PaletteContent /> : null
}

const DEFAULT_MESSAGE = 'Point and pull the trigger (or pinch) to choose. Say “go back” or “hide menu” anytime.'

function PaletteContent() {
  const root = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const ui = usePaletteUI()
  const inAR = useXR((s) => s.mode === 'immersive-ar')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const voice = useVoiceCommands(VOICE_OPTIONS)
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation)
  const [, setHistoryTick] = useState(0)
  // Re-render on anything the palette shows (the snapshot itself reads the stores directly).
  useWorld((s) => s.tool + s.selectedId + s.selectedActorId + s.geometryVersion + Object.keys(s.actors).length)
  useEditor()
  useNav((s) => s.status + s.replanCount)
  useRoutePlan()
  useAttendee()
  useMocap()
  useFlow((s) => !!s.draft)
  useGuide((s) => s.open)
  useWorldLibrary((s) => s.worlds.length + s.activeName)
  useAssetLibrary((s) => s.version)
  usePlacement((s) => s.status)
  usePaletteOffsets()
  useScan()
  useSyncExternalStore(subscribeActorRuntime, actorRuntimeRevision, actorRuntimeRevision)

  useEffect(() => subscribeHistory(() => setHistoryTick((n) => n + 1)), [])
  // Every session starts with the palette open at your side (closing it last time shouldn't look like a missing
  // menu), on the desktop HUD's tab; the HUD follows the palette when you take the headset off.
  useEffect(() => {
    usePaletteUI.setState((s) => ({ closed: false, hidden: false, spot: 'side', recenter: s.recenter + 1 }))
    openPage(useHudSection.getState().section)
    return () => useHudSection.getState().setSection(sectionOf(currentPage()))
  }, [])
  useEffect(() => {
    worldActions.listSavedWorlds()
  }, [])
  useEffect(() => {
    if (voice.lastError) setMessage(`Voice: ${voice.lastError}`)
    else if (voice.lastResult && 'message' in voice.lastResult) setMessage(`Voice: ${voice.lastResult.message}`)
    else if (voice.lastTranscript) setMessage(`Heard: “${voice.lastTranscript}”`)
  }, [voice.lastTranscript, voice.lastResult, voice.lastError])
  // A confirmation always shows: reopen the palette in front of you if it was closed or collapsed.
  useEffect(() => {
    if (request && (usePaletteUI.getState().closed || usePaletteUI.getState().hidden)) summonPalette()
  }, [request])

  const snapshot = readPaletteSnapshot({
    voice: { listening: voice.isListening, partial: voice.lastPartial ?? '' },
    message,
    confirm: request ? { id: request.id, message: request.message } : null,
    busy,
    inAR,
  })
  const model = buildPalette(snapshot)
  model.actions.voice = () => (voice.isListening ? voice.stopListening() : voice.startListening())

  const onPress = (id: string) => {
    const action = model.actions[id]
    // While busy, only the confirmation's own buttons work: a busy action is usually the one awaiting that answer
    // (load / create / overwrite), so blocking them too would leave the palette stuck.
    if (!action || (busy && !id.startsWith('confirm:'))) return
    let result: unknown
    try {
      result = action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That action failed.')
      return
    }
    if (!(result instanceof Promise)) return report(result)
    setBusy(true)
    result.then(report, (error: unknown) => setMessage(error instanceof Error ? error.message : 'That action failed.')).finally(() => setBusy(false))
  }
  const report = (result: unknown) => {
    const r = result as { ok?: boolean; error?: string } | undefined
    if (r && r.ok === false) setMessage(r.error || 'Cancelled.')
  }

  // Placement: off to your left on session start, straight ahead when summoned; then it stays put.
  const positioned = useRef(false)
  const v = useMemo(() => ({ position: new THREE.Vector3(), direction: new THREE.Vector3(), yaw: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ') }), [])
  useEffect(() => {
    if (ui.recenter) positioned.current = false
  }, [ui.recenter])
  useFrame(() => {
    const g = root.current
    if (!g) return
    if (positioned.current) {
      // The wrist Menu uses this to decide between closing the palette and bringing it to you.
      g.getWorldPosition(paletteAnchor.position)
      paletteAnchor.placed = !usePaletteUI.getState().closed
      return
    }
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(v.position)
    camera.getWorldQuaternion(v.yaw)
    v.euler.setFromQuaternion(v.yaw, 'YXZ')
    v.yaw.setFromEuler(new THREE.Euler(0, v.euler.y, 0))
    // The group origin is the panel's top edge: a little above eye level so the panel sits around it.
    if (usePaletteUI.getState().spot === 'front') v.direction.set(useGuide.getState().open ? -0.38 : 0, 0.22, -0.8)
    else v.direction.set(-0.55, 0.24, -0.95)
    v.direction.applyQuaternion(v.yaw)
    g.position.copy(v.position).add(v.direction)
    g.quaternion.copy(v.yaw)
    positioned.current = true
  })

  return (
    <group ref={root} visible={!ui.closed || !!request}>
      {(!ui.closed || request) && <XRPanel name="palette" spec={model.spec} onPress={onPress} moveTarget={root} />}
    </group>
  )
}
