import { BRAND } from '../theme/brand'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { editorHref, LANDING_TEMPLATES, LANDING_VENUES, LANDING_WORLDS, type LandingWorldId } from './entry'
import { WorldDiorama } from './WorldDiorama'
import { manualInstallHint, promptInstall, useInstallState } from './install'

const VrDemoReplay = lazy(() => import('./VrDemoReplay'))
const DEMO_HASH = '#vr-demo'

const GITHUB = 'https://github.com/abelxmendoza/RealmForge-XR'

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function Brand() {
  return (
    <a className="rf-brand" href="#top" aria-label="RealmForge XR home">
      <img className="rf-brand-logo" src={BRAND.logo} width="52" height="52" alt="" />
      <span>
        REALMFORGE<em>XR</em>
      </span>
    </a>
  )
}

function TemplateCard({
  item,
  kind,
}: {
  item: (typeof LANDING_TEMPLATES)[number]
  kind: 'ENVIRONMENT' | 'VENUE'
}) {
  return (
    <article className={`rf-world-card rf-card-${item.id}`}>
      <a className="rf-card-art" href={editorHref(item.id)} aria-label={`Open ${item.name} in the editor`}>
        <span className="rf-card-index">
          {item.number} / {kind}
        </span>
        <WorldDiorama world={item.id} compact />
        <span className="rf-card-label">{item.label}</span>
        <span className="rf-card-arrow">
          <Arrow />
        </span>
      </a>
      <div className="rf-card-copy">
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <a href={editorHref(item.id)}>
          {kind === 'VENUE' ? 'Design this venue' : 'Build in this world'} <Arrow />
        </a>
      </div>
    </article>
  )
}

function InstallButton({ className, hintClassName }: { className: string; hintClassName?: string }) {
  const state = useInstallState()
  const [hint, setHint] = useState<string | null>(null)

  if (state === 'installed') {
    return (
      <span className={`${className} rf-install-done`} role="status">
        App installed ✓
      </span>
    )
  }

  const onClick = async () => {
    if (state === 'available') {
      setHint(null)
      await promptInstall()
    } else {
      setHint(manualInstallHint())
    }
  }

  return (
    <span className="rf-install">
      <button type="button" className={className} onClick={() => void onClick()}>
        Install app <span aria-hidden="true">↓</span>
      </button>
      {hintClassName && (
        <span className={hintClassName} aria-live="polite">
          {hint}
        </span>
      )}
    </span>
  )
}

function enterLabel(id: LandingWorldId) {
  if (id === 'empty-event-venue') return 'Enter Empty Space'
  if (id === 'job-fair') return 'Enter the venue'
  if (id === 'music-festival') return 'Enter the festival'
  if (id === 'factory-floor') return 'Enter the factory'
  return 'Enter the forge'
}

export default function LandingPage() {
  const [world, setWorld] = useState<LandingWorldId>('empty-event-venue')
  const selected = LANDING_TEMPLATES.find((item) => item.id === world)!
  const [demoOpen, setDemoOpen] = useState(() => window.location.hash === DEMO_HASH)
  const openDemo = () => setDemoOpen(true)
  const closeDemo = useCallback(() => {
    setDemoOpen(false)
    if (window.location.hash === DEMO_HASH) history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  useEffect(() => {
    const onHash = () => window.location.hash === DEMO_HASH && setDemoOpen(true)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="rf-landing" id="top">
      <a className="rf-skip" href="#main">
        Skip to content
      </a>
      <header className="rf-header">
        <div className="rf-shell rf-nav">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#worlds">The worlds</a>
            <a href="#events">Events & venues</a>
            <a href="#workflow">How it works</a>
            <a href="#scans">Import a space</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub <Arrow />
            </a>
          </nav>
          <div className="rf-nav-actions">
            <InstallButton className="rf-button rf-button-small rf-button-ghost rf-nav-install" />
            <a className="rf-button rf-button-small" href={editorHref()}>
              Launch editor <Arrow />
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="rf-shell rf-hero" aria-labelledby="hero-heading">
          <div className="rf-hero-copy">
            <p className="rf-eyebrow">
              <span className="rf-dot" /> WORLDBUILDING · SPATIAL PLANNING · WEBXR
            </p>
            <h1 id="hero-heading">
              Big ideas.
              <br />
              Built in
              <br />
              <span>your space.</span>
            </h1>
            <p className="rf-intro">
              Build a world, or start with a scan of a real space.{' '}
              <br />
              Lay out venues and factory floors, plan multi-stop routes, and watch people and robots navigate your design. Explore it from tabletop to life size.
            </p>
            <div className="rf-hero-actions">
              <a className="rf-button" href={editorHref(selected.id)}>
                {enterLabel(selected.id)} <Arrow />
              </a>
              <button className="rf-button rf-button-ghost rf-demo-launch" onClick={openDemo}>
                <i aria-hidden="true">▶</i> Watch the simulated XR demo
              </button>
              <a className="rf-text-link" href="#events">
                Browse event venues <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="rf-compatibility">
              <span className="rf-device-icon" aria-hidden="true">
                ⌘
              </span>
              <span>
                Start on desktop. Step into XR.
                <small>Mouse, hands, controllers, or optional voice.</small>
              </span>
            </div>
          </div>

          <div className={`rf-hero-visual rf-world-${world}`}>
            <div className="rf-orbit rf-orbit-one" />
            <div className="rf-orbit rf-orbit-two" />
            <div className="rf-visual-topline">
              <span>THE FORGE / WORLD PREVIEW</span>
              <span aria-hidden="true">✳</span>
            </div>
            <WorldDiorama world={world} />
            <div className="rf-model-tag">
              <span className="rf-dot" /> BUILD. PLAN. TEST.
            </div>
            <div className="rf-world-picker" aria-label="Preview an environment">
              {LANDING_TEMPLATES.map((item) => (
                <button key={item.id} aria-pressed={world === item.id} onClick={() => setWorld(item.id)}>
                  <span>{item.number}</span>
                  {item.shortName}
                </button>
              ))}
            </div>
            <p className="rf-visual-caption" aria-live="polite">
              {selected.category}
              <span>↗</span>
            </p>
          </div>
        </section>

        <div className="rf-capability-strip">
          <div className="rf-shell">
            <span>
              <i>01</i> 7 STARTING TEMPLATES
            </span>
            <span>
              <i>02</i> MULTI-STOP ROUTES
            </span>
            <span>
              <i>03</i> REAL-WORLD SCAN IMPORT
            </span>
            <span>
              <i>04</i> DESKTOP + WEBXR
            </span>
          </div>
        </div>

        <section id="workflow" className="rf-shell rf-workflow" aria-labelledby="workflow-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">FROM AN IDEA TO A WORLD IN MOTION</p>
              <h2 id="workflow-heading">Build. Plan. Test.</h2>
            </div>
            <p>Choose a starting point. Give it a route.<br />Change the layout and see what happens.</p>
          </div>
          <div className="rf-event-steps">
            <article>
              <span>01 / BUILD</span>
              <h3>Make the space yours.</h3>
              <p>Start empty, open a template, or import a .glb scan. Place objects, adjust dimensions, and shape the layout.</p>
            </article>
            <article>
              <span>02 / PLAN</span>
              <h3>Decide where things go.</h3>
              <p>Add ordered waypoints for robots and actors. Mark traffic zones and destinations, then inspect the route.</p>
            </article>
            <article>
              <span>03 / TEST</span>
              <h3>Put the plan in motion.</h3>
              <p>Play or pause movement. Move an obstacle and watch the path adapt while your waypoints stay in order—or see that the route is blocked.</p>
            </article>
          </div>
        </section>

        <section id="scans" className="rf-shell rf-scans" aria-labelledby="scans-heading">
          <div className="rf-scan-copy">
            <p className="rf-eyebrow">BRING YOUR OWN SPACE / .GLB IMPORT</p>
            <h2 id="scans-heading">Your real space.<br />Your next layout.</h2>
            <p>Bring in a phone or LiDAR scan of a room, venue, or factory as a 3D backdrop. Line it up with the grid, measure a known distance to set its scale, and plan on top of it.</p>
            <p>Hide the ceiling to see inside. Adjust transparency, place equipment and barriers, then explore the same space in XR.</p>
            <a className="rf-button rf-button-ghost" href={editorHref('empty-event-venue')}>Open editor to import a scan <Arrow /></a>
            <small>In the editor, choose Build → Import scan. Scan files stay on this device; exported worlds keep the alignment, so another device needs the original .glb file again. Scan surfaces are a visual reference; add solid objects to define navigation obstacles.</small>
          </div>
          <div className="rf-scan-steps" aria-label="Scan planning workflow">
            <article><span>01 / IMPORT</span><h3>Bring in the room.</h3><p>Import a .glb scan. Automatic floor and orientation detection gives you a starting alignment.</p></article>
            <article><span>02 / ALIGN</span><h3>Get the scale right.</h3><p>Measure, rotate, and shift the scan. Cut away the ceiling for a clear view of the floor.</p></article>
            <article><span>03 / DESIGN</span><h3>Try the next layout.</h3><p>Add your own objects and routes over the scan, then inspect the plan on screen or in XR.</p></article>
          </div>
        </section>

        <section id="events" className="rf-shell rf-events" aria-labelledby="events-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">EVENTS & VENUES</p>
              <h2 id="events-heading">
                Stage the room.
                <br />
                Watch the flow.
              </h2>
            </div>
            <p>
              Turn an empty hall into a job fair, or an open field into a festival.
              <br />
              Every booth, gate, stall and stage is an editable catalog prop.
            </p>
          </div>

          <div className="rf-event-steps" aria-label="Event venue workflow">
            <article>
              <span>01</span>
              <h3>Create</h3>
              <p>Open Empty Space, Job Fair or Music Festival and place stages, booths, stalls and wayfinding.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Configure</h3>
              <p>Assign simulation roles (entrance, ticket gate, booth, stage, bar, exit) and mark queues and no-go areas.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Simulate</h3>
              <p>Start the virtual attendee. Move a booth into a walkway and watch the path replan.</p>
            </article>
          </div>

          <div className="rf-world-cards rf-venue-cards">
            {LANDING_VENUES.map((item) => (
              <TemplateCard key={item.id} item={item} kind="VENUE" />
            ))}
          </div>

          <button className="rf-demo-banner" onClick={openDemo}>
            <span className="rf-demo-banner-play" aria-hidden="true">
              ▶
            </span>
            <span>
              <b>Preview the workflow from an XR point of view</b>
              <small>48-second simulated POV replay · place booths, start the attendee, watch the route replan</small>
            </span>
            <Arrow />
          </button>

          <p className="rf-event-note">
            Simulation is a design sketch for layout flow — not a certified crowd, egress, or accessibility model.
          </p>
        </section>

        <section id="worlds" className="rf-shell rf-worlds" aria-labelledby="worlds-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">A WORLD OF STARTING POINTS</p>
              <h2 id="worlds-heading">
                Where will you
                <br />
                take it?
              </h2>
            </div>
            <p>
              A city. A new frontier. A warehouse or a factory in motion.
              <br />
              Start with a template, then make it yours.
            </p>
          </div>
          <div className="rf-world-cards">
            {LANDING_WORLDS.map((item) => (
              <TemplateCard key={item.id} item={item} kind="ENVIRONMENT" />
            ))}
          </div>
          <a className="rf-blank-link" href={editorHref()}>
            Prefer a clean slate? Open the editor and create a blank world. <Arrow />
          </a>
        </section>

        <section id="possibilities" className="rf-possibilities">
          <div className="rf-shell rf-possibilities-inner">
            <div className="rf-section-heading">
              <div>
                <p className="rf-eyebrow">YOUR IDEAS. A LITTLE MORE DIMENSION.</p>
                <h2 id="possibilities-heading">
                  Build the scene.
                  <br />
                  <span>Change the outcome.</span>
                </h2>
              </div>
              <p>
                Make a place, then put it to the test.
                <br />
                Layouts, routes, spatial controls, and saved projects in one workspace.
              </p>
            </div>
            <div className="rf-feature-rows">
              <article>
                <span className="rf-feature-number">01 / CREATE</span>
                <h3>
                  Make room for
                  <br />
                  what’s next.
                </h3>
                <div>
                  <p>
                    Place buildings, roads, warehouse equipment, festival props, and people. Select and drag objects, adjust dimensions, snap to the grid, duplicate, or undo a change.
                  </p>
                  <span className="rf-feature-tags">
                    OBJECT CATALOG <b>·</b> EVENT PROPS <b>·</b> UNDO / REDO
                  </span>
                </div>
              </article>
              <article>
                <span className="rf-feature-number">02 / ROUTES</span>
                <h3>
                  Give your layout
                  <br />a moving part.
                </h3>
                <div>
                  <p>
                    Plan multiple stops for a robot or actor, then play or pause its journey. Keep your intended waypoints while navigation finds a detour around edited geometry. Mark one-way lanes, queues, and restricted areas.
                  </p>
                  <span className="rf-feature-tags">
                    WAYPOINTS <b>·</b> LIVE REPLANNING <b>·</b> TRAFFIC ZONES
                  </span>
                </div>
              </article>
              <article>
                <span className="rf-feature-number">03 / EXPLORE</span>
                <h3>
                  From your screen
                  <br />
                  to your space.
                </h3>
                <div>
                  <p>
                    Use hands or controllers to grab, rotate, and scale objects in WebXR. Switch from a tabletop model to a life-size view, with a wrist menu and floating controls close at hand.
                  </p>
                  <span className="rf-feature-tags">
                    HAND GRAB <b>·</b> TABLETOP TO 1:1 <b>·</b> VR / AR
                  </span>
                </div>
              </article>
              <article>
                <span className="rf-feature-number">04 / VOICE</span>
                <h3>Say the next<br />move.</h3>
                <div>
                  <p>Load a world, choose a tool, create objects, or control routes with supported voice commands. Use “add waypoint here” with your pointer, or type a command in the voice panel.</p>
                  <span className="rf-feature-tags">OPTIONAL MICROPHONE <b>·</b> TYPED COMMANDS <b>·</b> SPATIAL POINTER</span>
                </div>
              </article>
              <article>
                <span className="rf-feature-number">05 / KEEP</span>
                <h3>Pick up where<br />you left off.</h3>
                <div>
                  <p>Save and reopen projects in your browser’s world library. Export and import world JSON to carry supported layouts, routes, and settings between devices.</p>
                  <span className="rf-feature-tags">LOCAL SAVES <b>·</b> JSON IMPORT / EXPORT <b>·</b> UNDO / REDO</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="rf-shell rf-final">
          <img className="rf-final-mark rf-final-logo" src={BRAND.logoLarge} width="168" height="168" alt="" aria-hidden="true" />
          <p className="rf-eyebrow">SHAPE WORLDS. STAGE EVENTS. BRING THEM TO LIFE.</p>
          <h2>
            Your next world
            <br />
            starts here.
          </h2>
          <div className="rf-final-actions">
            <a className="rf-button" href={editorHref('empty-event-venue')}>
              Enter Empty Space <Arrow />
            </a>
            <a className="rf-button rf-button-ghost" href={editorHref('job-fair')}>
              Open job fair <Arrow />
            </a>
            <InstallButton className="rf-button rf-button-ghost" hintClassName="rf-install-hint" />
          </div>
          <p className="rf-final-note">Browser-based — no install needed to start building. Install it to launch from your desktop, phone or headset like any other app.</p>
        </section>
      </main>

      {demoOpen && (
        <Suspense
          fallback={
            <div className="rf-demo-backdrop">
              <p className="rf-demo-loading">Loading the headset replay…</p>
            </div>
          }
        >
          <VrDemoReplay onClose={closeDemo} />
        </Suspense>
      )}

      <footer className="rf-footer rf-shell">
        <div>
          <Brand />
          <p>A spatial worldbuilding, layout planning & simulation project.</p>
        </div>
        <div>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            Explore the source <Arrow />
          </a>
          <p>Made for the MOLTEN Hackathon.</p>
        </div>
        <p className="rf-hardware-note">
          Immersive features require a compatible WebXR browser. Headset behavior varies; physical Quest validation is
          ongoing. Voice input is optional and requires configuration. Event attendee simulation is illustrative only.
        </p>
      </footer>
    </div>
  )
}
