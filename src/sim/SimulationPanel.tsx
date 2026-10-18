import {
  pauseAttendeeSimulation,
  resetAttendeeSimulation,
  resumeAttendeeSimulation,
  startAttendeeSimulation,
  useAttendee,
} from './attendee'

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  walking: 'Walking',
  serving: 'At destination',
  done: 'Done',
  blocked: 'Blocked',
  'no-path': 'No path',
}

/** Desktop controls for the single-attendee event simulation MVP. */
export function SimulationPanel() {
  const status = useAttendee()

  return (
    <section className="sim-panel">
      <h3>Event simulation</h3>
      <p className="hint">
        One virtual attendee: Entrance → Registration → Booths → Exit. Moving obstacles triggers replan.
      </p>
      <div className="row">
        {!status.running || status.phase === 'done' ? (
          <button
            onClick={() => {
              resetAttendeeSimulation()
              startAttendeeSimulation()
            }}
          >
            Start
          </button>
        ) : status.paused ? (
          <button onClick={() => resumeAttendeeSimulation()}>Resume</button>
        ) : (
          <button onClick={() => pauseAttendeeSimulation()}>Pause</button>
        )}
        <button
          onClick={() => resetAttendeeSimulation()}
          disabled={!status.running && status.phase === 'idle'}
          title={!status.running && status.phase === 'idle' ? 'Simulation is already idle' : 'Reset the attendee simulation'}
        >
          Reset Simulation
        </button>
      </div>
      <div className="sim-status">
        <div>
          <strong>{PHASE_LABEL[status.phase] ?? status.phase}</strong>
        </div>
        <div>{status.task}</div>
        {status.destinationLabel ? <div>Destination: {status.destinationLabel}</div> : null}
        <div>
          Step {status.stepIndex + 1} · replans {status.replanCount}
        </div>
      </div>
      <p className="hint">Not a certified crowd / egress model — planning preview only.</p>
    </section>
  )
}
