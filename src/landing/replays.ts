/**
 * Scripted replays of real editor sessions, shown on the landing page.
 * Recorded by tools/record-demos.mjs (`npm run demos:record`) into public/demos/.
 */
export const REPLAYS = [
  {
    id: 'build',
    title: 'Build a scene from scratch',
    blurb: 'Empty board, buildings, a wall and trees, then a robot that routes around all of it.',
    device: 'DESKTOP',
  },
  {
    id: 'replan',
    title: 'Block the path, watch it replan',
    blurb: 'Drop a wall across the robot’s route in Forge District. A* finds a new way at once.',
    device: 'DESKTOP',
  },
  {
    id: 'event',
    title: 'Run a job fair walkthrough',
    blurb: 'Start a virtual attendee: registration, booths, stage, exit.',
    device: 'DESKTOP',
  },
  {
    id: 'vr',
    title: 'Grab the city in VR',
    blurb: 'Enter VR, pick up a building with a controller and set it down in the robot’s path.',
    device: 'VR · QUEST 3',
  },
] as const

export type ReplayId = (typeof REPLAYS)[number]['id']

export const replaySrc = (id: ReplayId, ext: 'mp4' | 'webm' | 'jpg') => `${import.meta.env.BASE_URL}demos/${id}.${ext}`
