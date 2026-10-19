import { BRAND } from '../theme/brand'
import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties } from 'react'
import { editorHref, LANDING_TEMPLATES, LANDING_VENUES, LANDING_WORLDS, type LandingWorldId } from './entry'
import { WorldDiorama } from './WorldDiorama'
import { manualInstallHint, promptInstall, useInstallState } from './install'

const VrDemoReplay = lazy(() => import('./VrDemoReplay'))
const DEMO_HASH = '#vr-demo'

const GITHUB = 'https://github.com/abelxmendoza/RealmForge-XR'

const TECHNOLOGY_CREDITS = [
  { name: 'Meta Quest 3S', label: 'IMMERSIVE HARDWARE', detail: 'Explore the headset for browser-based XR. Physical headset validation is ongoing.', href: 'https://www.meta.com/quest/quest-3s/', logo: 'meta.svg', action: 'Explore Quest 3S', color: '#5b9dff' },
  { name: 'Scaniverse', label: 'REAL-WORLD CAPTURE', detail: 'Capture your space, export mesh GLB sections and bring them into the forge.', href: 'https://scaniverse.com', logo: 'scaniverse.webp', action: 'Discover Scaniverse', color: '#ee866b' },
  { name: 'Niantic Spatial', label: 'SPATIAL TECHNOLOGY', detail: 'The team behind Scaniverse and its spatial mapping tools.', href: 'https://www.nianticspatial.com/', logo: 'niantic.webp', action: 'Explore Niantic Spatial', color: '#7fa1ff' },
  { name: 'Scaniverse for iPhone', label: 'CAPTURE ON iOS', detail: 'Get the Scaniverse iPhone app directly from the Apple App Store.', href: 'https://apps.apple.com/us/app/scaniverse-3d-scanner/id1541433223', logo: 'apple.webp', action: 'View on the App Store', color: '#d7dce6' },
  { name: 'AssemblyAI', label: 'VOICE COMMAND TRANSCRIPTION', detail: 'Streaming speech-to-text powers the voice command transcription in RealmForge XR.', href: 'https://www.assemblyai.com/', logo: 'assemblyai.svg', action: 'Meet AssemblyAI', color: '#a496ff' },
  { name: 'Intel RealSense / RealSense', label: 'DEPTH CAMERA HARDWARE', detail: 'Explore depth cameras for spatial sensing. Direct capture is not currently integrated.', href: 'https://www.realsenseai.com/stereo-depth-cameras/', logo: 'realsense.webp', action: 'Explore depth cameras', color: '#62c8d0' },
] as const

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
            <a href="#vision">Robotics vision</a>
            <a href="#worlds">The worlds</a>
            <a href="#scans">Import scans</a>
            <a href="#technology">Technology & credits</a>
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
              <span className="rf-dot" /> BUILD ENVIRONMENTS / SIMULATE ROBOT TASKS
            </p>
            <h1 id="hero-heading">
              Build worlds.
              <br />
              Step inside.
              <br />
              <span>Bring them to life.</span>
            </h1>
            <p className="rf-intro">
              Build simulated workspaces for autonomous robot tasks.{' '}
              <br />
              Scan a real environment with Scaniverse and import its meshes, or build from a template. Edit the same world as a tabletop model or explore it at life size in VR.
            </p>
            <div className="rf-hero-actions">
              <a className="rf-button" href={editorHref(selected.id)}>
                {enterLabel(selected.id)} <Arrow />
              </a>
              <button className="rf-button rf-button-ghost rf-demo-launch" onClick={openDemo}>
                <i aria-hidden="true">▶</i> Watch the VR demo
              </button>
              <a className="rf-text-link" href="#vision">
                Explore the vision <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="rf-compatibility">
              <span className="rf-device-icon" aria-hidden="true">
                ⌘
              </span>
              <span>
                Start on desktop. Step into XR.
                <small>Worldbuilding, motion and simulation in one creative space.</small>
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
              <i>01</i> BUILD WORLDS
            </span>
            <span>
              <i>02</i> HUMAN MOTION
            </span>
            <span>
              <i>03</i> ROBOT SIMULATION
            </span>
            <span>
              <i>04</i> ART + IMMERSIVE XR
            </span>
          </div>
        </div>

        <section id="vision" className="rf-shell rf-technology" aria-labelledby="vision-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">ONE WORLD. MANY POSSIBILITIES.</p>
              <h2 id="vision-heading">Build the workspace.<br />Test the task.</h2>
            </div>
            <p>A robotics simulation and task-building sandbox, working toward human demonstrations and autonomous robot learning. The next milestone: one robot visiting inspection checkpoints in a simplified data-center test area.</p>
          </div>
          <div className="rf-usecase-grid">
            <article className="rf-credit-card">
              <span className="rf-credit-label">01 / ROBOTICS</span>
              <h3>Build a world.<br />Teach through motion.</h3>
              <p>Create environments and experiment with robot routes and obstacles. The longer-term goal is to demonstrate tasks through human motion, then train and evaluate robots to perform those tasks autonomously inside the simulated world.</p>
              <span className="rf-credit-action">Today: navigation sandbox · Vision: robot training</span>
            </article>
            <article className="rf-credit-card">
              <span className="rf-credit-label">02 / MOTION CAPTURE</span>
              <h3>Your body.<br />Inside the world.</h3>
              <p>A Rokoko-compatible bridge and debug skeleton lay the groundwork for bringing human movement into the scene. The pipeline has been exercised with synthetic motion; a real suit is still unvalidated.</p>
              <span className="rf-credit-action">Prototype: mock motion pipeline</span>
            </article>
            <article className="rf-credit-card">
              <span className="rf-credit-label">03 / REAL WORLD → SIMULATION</span>
              <h3>Scan the space.<br />Bring it into the world.</h3>
              <p>Capture a room, workshop or test area in Scaniverse. Import mesh GLB sections, align them and add catalog objects and route checkpoints to create a simulation workspace.</p>
              <span className="rf-credit-action">Today: mesh import and manual alignment</span>
            </article>
            <article className="rf-credit-card">
              <span className="rf-credit-label">04 / TWO WAYS TO EDIT</span>
              <h3>Plan from above.<br />Edit from within.</h3>
              <p>Use the tabletop overview to arrange your world, then enter at life size to inspect and edit from inside. Both views share the same objects, tools and saved world.</p>
              <span className="rf-credit-action">VR: wrist Enter / Tabletop · View controls</span>
            </article>
          </div>
          <div className="rf-training-vision" aria-labelledby="training-heading">
            <p className="rf-eyebrow">THE ROBOTICS ROADMAP / FUTURE GOAL</p>
            <h3 id="training-heading">A world to build in.<br />A world robots can learn in.</h3>
            <p>Create the environment, show the task through body-suit motion, and eventually train robots to work autonomously within it. Evaluate their behavior in simulation before considering transfer to physical hardware.</p>
            <ol className="rf-training-steps" aria-label="Robot learning roadmap">
              <li><strong>01 / Build</strong><span>Shape the world, obstacles and task environment.</span></li>
              <li><strong>02 / Demonstrate</strong><span>Capture human movement and task demonstrations.</span></li>
              <li><strong>03 / Train</strong><span>Connect a robot-learning system to learn autonomous task behavior.</span></li>
              <li><strong>04 / Evaluate</strong><span>Measure task success, failures and behavior across simulated scenarios.</span></li>
            </ol>
            <p className="rf-credit-note">This is the intended development path. Demonstration recording, policy training and autonomous task evaluation are not implemented yet. Physical-world transfer would require separate validation.</p>
          </div>
          <p className="rf-credit-note">RealmForge is an evolving prototype. Autonomous policy training remains a future goal. Art, film and gaming are possible later applications; robotics workspaces are the current focus.</p>
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

        <section id="scans" className="rf-shell rf-events" aria-labelledby="scans-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">NEW / REAL-WORLD PROPERTY SCANS</p>
              <h2 id="scans-heading">Scan the real world.<br />Build its simulated workspace.</h2>
            </div>
            <p>Capture real environments in Scaniverse and import their polygon meshes into RealmForge.<br />Assemble the space, add simulation objects, then edit it on a tabletop or from inside VR.</p>
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
            <a className="rf-text-link" href={`${GITHUB}/blob/main/docs/property-scans.md`} target="_blank" rel="noreferrer">Read the scan guide <Arrow /></a>
          </div>
          <p className="rf-event-note">
            Capture happens in Scaniverse; RealmForge imports the meshes. Alignment is manual. Files stay on your device unless you export and transfer them. Headset file import exits immersive mode. Imported meshes provide visual geometry; robot navigation still uses the flat plane and explicitly placed solid objects. Automatic scan-to-collision conversion, stairs and terrain navigation are not implemented. Physical Quest and real Scaniverse-file validation remain ongoing.
          </p>
        </section>

        <section id="events" className="rf-shell rf-events" aria-labelledby="events-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">A WORLDBUILDING EXAMPLE / EVENTS & VENUES</p>
              <h2 id="events-heading">
                One way to use it.
                <br />
                Stage an event.
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

        <section id="possibilities" className="rf-possibilities">
          <div className="rf-shell rf-possibilities-inner">
            <div className="rf-section-heading">
              <div>
                <p className="rf-eyebrow">TOOLS YOU CAN EXPLORE TODAY</p>
                <h2 id="possibilities-heading">
                  Build the scene.
                  <br />
                  <span>Change the outcome.</span>
                </h2>
              </div>
              <p>
                Make a place, then put it to the test.
                <br />
                Import real spaces, build robot workspaces and try the current navigation sandbox.
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

        <section id="technology" className="rf-shell rf-technology" aria-labelledby="technology-heading">
          <div className="rf-section-heading">
            <div>
              <p className="rf-eyebrow">HARDWARE / TOOLS / ACKNOWLEDGMENTS</p>
              <h2 id="technology-heading">Good tools.<br />Bigger possibilities.</h2>
            </div>
            <p>The technology behind the workflow, and the hardware worth exploring.<br />Meet the builders behind the tools.</p>
          </div>
          <div className="rf-credit-grid">
            {TECHNOLOGY_CREDITS.map((credit) => (
              <a key={credit.name} className="rf-credit-card" href={credit.href} target="_blank" rel="noreferrer" style={{ '--credit-accent': credit.color } as CSSProperties}>
                <div className="rf-credit-top"><span className={`rf-credit-logo ${credit.logo === 'realsense.webp' ? 'rf-credit-logo-dark' : ''}`}><img src={`/credits/${credit.logo}`} alt="" loading="lazy" width="140" height="44" /></span><Arrow /></div>
                {credit.logo === 'meta.svg' && (
                  <img className="rf-credit-product" src="/images/meta-quest-3s.webp" width="960" height="960" loading="lazy" alt="Meta Quest 3S headset with two Touch Plus controllers" />
                )}
                <span className="rf-credit-label">{credit.label}</span>
                <h3>{credit.name}</h3>
                <p>{credit.detail}</p>
                <span className="rf-credit-action">{credit.action} <Arrow /></span>
              </a>
            ))}
          </div>
          <p className="rf-credit-note">Quest 3S product photo via <a href="https://www.jbhifi.co.nz/products/meta-quest-3s-256gb" target="_blank" rel="noreferrer">JB Hi-Fi</a>.</p>
          <p className="rf-credit-note">Brand names and logos belong to their respective owners. Credits identify tools and hardware; they do not imply sponsorship, partnership or endorsement.</p>
        </section>

        <section className="rf-shell rf-final">
          <img className="rf-final-mark rf-final-logo" src={BRAND.logoLarge} width="168" height="168" alt="" aria-hidden="true" />
          <p className="rf-eyebrow">BUILD WORLDS. EXPLORE MOTION. CREATE WHAT’S NEXT.</p>
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
          <p>A robotics workspace sandbox for real-world scans, scene building and simulated tasks.</p>
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
