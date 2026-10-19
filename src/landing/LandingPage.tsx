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
            <a href="#scans">Real-world scans</a>
            <a href="#worlds">The worlds</a>
            <a href="#events">Events & venues</a>
            <a href="#possibilities">The possibilities</a>
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
              <span className="rf-dot" /> REAL SPACES. VIRTUAL WORLDS. ONE FORGE.
            </p>
            <h1 id="hero-heading">
              Big ideas.
              <br />
              Built in
              <br />
              <span>your space.</span>
            </h1>
            <p className="rf-intro">
              Bring your scanned rooms, garage or yard into the forge.{' '}
              <br />
              Align mesh sections, plan your layout and explore it in WebXR. Or start with a venue, festival or factory template.
            </p>
            <div className="rf-hero-actions">
              <a className="rf-button" href={editorHref(selected.id)}>
                {enterLabel(selected.id)} <Arrow />
              </a>
              <button className="rf-button rf-button-ghost rf-demo-launch" onClick={openDemo}>
                <i aria-hidden="true">▶</i> Watch the VR demo
              </button>
              <a className="rf-text-link" href="#scans">
                Explore the scanning workflow <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="rf-compatibility">
              <span className="rf-device-icon" aria-hidden="true">
                ⌘
              </span>
              <span>
                Start on desktop. Step into XR.
                <small>Imported scans, editable worlds and shared spatial tools.</small>
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
              <span className="rf-dot" /> BUILD. STAGE. SIMULATE.
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
              <i>01</i> PROPERTY SCANS
            </span>
            <span>
              <i>02</i> EVENT VENUES
            </span>
            <span>
              <i>03</i> ATTENDEE FLOW
            </span>
            <span>
              <i>04</i> DESKTOP + WEBXR
            </span>
          </div>
        </div>

        <section id="scans" className="rf-shell rf-events" aria-labelledby="scans-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">NEW / REAL-WORLD PROPERTY SCANS</p>
              <h2 id="scans-heading">Your space.<br />A new perspective.</h2>
            </div>
            <p>Bring rooms, floors and outdoor areas together from separate mesh scans.<br />Arrange your property on screen, then explore the same world in immersive XR.</p>
          </div>
          <div className="rf-event-steps" aria-label="Property scan workflow">
            <article>
              <span>01 / CAPTURE</span>
              <h3>Scan a section</h3>
              <p>Capture overlapping rooms or outdoor areas in Scaniverse. Export polygon mesh GLB files; Gaussian splats are not supported.</p>
            </article>
            <article>
              <span>02 / ASSEMBLE</span>
              <h3>Make it your property</h3>
              <p>Open Build → Property scans → Add scans (.glb). Name each section, align it manually and calibrate scale with a known distance. Set floor elevations and hide or solo sections.</p>
            </article>
            <article>
              <span>03 / EXPLORE</span>
              <h3>Take it into XR</h3>
              <p>Use shared web and headset controls for alignment, opacity and ceiling cuts. Export a property bundle with the original meshes to open it on another device.</p>
            </article>
          </div>
          <div className="rf-hero-actions">
            <a className="rf-button" href={editorHref()}>Open editor to import scans <Arrow /></a>
            <a className="rf-text-link" href="https://scaniverse.com" target="_blank" rel="noreferrer">Get Scaniverse <Arrow /></a>
            <a className="rf-text-link" href="https://apps.apple.com/us/app/scaniverse-3d-scanner/id1541433223" target="_blank" rel="noreferrer">Scaniverse for iPhone <Arrow /></a>
            <a className="rf-text-link" href="https://www.nianticspatial.com/" target="_blank" rel="noreferrer">Niantic Spatial <Arrow /></a>
            <a className="rf-text-link" href={`${GITHUB}/blob/main/docs/property-scans.md`} target="_blank" rel="noreferrer">Read the scan guide <Arrow /></a>
          </div>
          <p className="rf-event-note">
            Capture happens in Scaniverse; RealmForge imports the meshes. Alignment is manual. Files stay on your device unless you export and transfer them. Headset file import exits immersive mode. Scanned floors do not add stairs or terrain navigation to the flat-plane simulation. Physical Quest and real Scaniverse-file validation remain ongoing.
          </p>
        </section>

        <section className="rf-shell rf-headset" aria-labelledby="headset-heading">
          <figure>
            <img src="/images/meta-quest-3s.webp" width="960" height="960" loading="lazy" alt="White Meta Quest 3S headset with two Touch Plus controllers" />
            <figcaption>Meta Quest 3S · Product photo via <a href="https://www.jbhifi.co.nz/products/meta-quest-3s-256gb" target="_blank" rel="noreferrer">JB Hi-Fi</a></figcaption>
          </figure>
          <div>
            <p className="rf-eyebrow">FROM THE BROWSER TO THE HEADSET</p>
            <h2 id="headset-heading">Step inside<br />your next idea.</h2>
            <p>Build on screen, then explore your world in immersive XR with a compatible headset browser. Use the floating palette to adjust your layout and imported scan sections.</p>
            <div className="rf-hero-actions">
              <a className="rf-button rf-button-ghost" href={editorHref()}>Open RealmForge XR <Arrow /></a>
              <a className="rf-text-link" href="https://www.meta.com/quest/quest-3s/" target="_blank" rel="noreferrer">Official Meta Quest 3S <Arrow /></a>
            </div>
            <p><a className="rf-text-link" href="https://www.realsenseai.com/stereo-depth-cameras/" target="_blank" rel="noreferrer">Intel RealSense / RealSense depth cameras <Arrow /></a></p>
            <p className="rf-headset-note">Explore depth-camera hardware on the official RealSense site. Direct RealSense capture is not currently integrated into RealmForge XR.</p>
            <p className="rf-headset-note">Meta Quest 3S shown. Physical headset validation is ongoing. RealmForge XR is an independent project and is not affiliated with or endorsed by Meta.</p>
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
              <b>See the whole workflow from inside the headset</b>
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
                RealmForge connects imported spaces, worldbuilding and layout simulation.
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
                    Place buildings, roads, walls, warehouse equipment, and event catalog props. Move, rotate, resize,
                    and customize with a shared set of tools.
                  </p>
                  <span className="rf-feature-tags">
                    OBJECT CATALOG <b>·</b> EVENT PROPS <b>·</b> UNDO / REDO
                  </span>
                </div>
              </article>
              <article>
                <span className="rf-feature-number">02 / SIMULATE</span>
                <h3>
                  Give your layout
                  <br />a moving part.
                </h3>
                <div>
                  <p>
                    Send an AGV down its lane, or start a virtual attendee through gates, booths, the stage and exits.
                    Block a path and watch navigation find a new way through.
                  </p>
                  <span className="rf-feature-tags">
                    ROBOT ROUTES <b>·</b> ATTENDEE FLOW <b>·</b> TRAFFIC ZONES
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
                    Build with mouse and keyboard, or enter WebXR for spatial controls. Keep your worlds and venues in
                    the local library. Export world JSON, or transfer scans and world data together in a property bundle.
                  </p>
                  <span className="rf-feature-tags">
                    DESKTOP <b>·</b> VR / AR CONTROLS <b>·</b> WORLD LIBRARY
                  </span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="rf-shell rf-final">
          <img className="rf-final-mark rf-final-logo" src={BRAND.logoLarge} width="168" height="168" alt="" aria-hidden="true" />
          <p className="rf-eyebrow">SHAPE WORLDS. STAGE EVENTS. BRING THEM TO LIFE.</p>
          <h2>
            Your next space
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
          <p>Real-world mesh scans, spatial worldbuilding & layout simulation.</p>
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
