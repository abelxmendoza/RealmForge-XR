import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { installThumbnailTracking, registerThumbnailCapture } from '../world/library'

const W = 240
const H = 150

/**
 * Lets the world library grab a small preview of the current view after a save.
 * Renders one frame and copies the canvas immediately (works without preserveDrawingBuffer).
 * Skipped while in an immersive session, where the page canvas isn't what the user sees.
 */
export function ThumbnailCapture() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    registerThumbnailCapture(() => {
      if (gl.xr.isPresenting) return null
      try {
        gl.render(scene, camera)
        const src = gl.domElement
        // Centre-crop to the thumbnail's aspect ratio.
        const aspect = W / H
        let sw = src.width
        let sh = src.width / aspect
        if (sh > src.height) {
          sh = src.height
          sw = sh * aspect
        }
        const g = out.getContext('2d')!
        g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H)
        return out.toDataURL('image/jpeg', 0.72)
      } catch {
        return null
      }
    })
    const stop = installThumbnailTracking()
    return () => {
      registerThumbnailCapture(null)
      stop()
    }
  }, [gl, scene, camera])

  return null
}
