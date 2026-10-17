/**
 * XR-facing simulation actions (Agent / Emiliano integration surface).
 * Does not own gesture handling.
 */

export {
  startAttendeeSimulation,
  pauseAttendeeSimulation,
  resumeAttendeeSimulation,
  resetAttendeeSimulation,
  isAttendeeRunning,
  isAttendeePaused,
  useAttendee,
  listSimulationDestinations,
} from './attendee'
