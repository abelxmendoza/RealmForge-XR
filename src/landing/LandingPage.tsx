import { BRAND } from '../theme/brand'
import { useState } from 'react'
import { editorHref, LANDING_TEMPLATES, LANDING_VENUES, LANDING_WORLDS, type LandingWorldId } from './entry'
import { WorldDiorama } from './WorldDiorama'

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

function enterLabel(id: LandingWorldId) {
  if (id === 'empty-event-venue') return 'Enter Empty Space'
  if (id === 'job-fair') return 'Enter the venue'
  return 'Enter the forge'
}

export default function LandingPage() {
  const [world, setWorld] = useState<LandingWorldId>('empty-event-venue')
  const selected = LANDING_TEMPLATES.find((item) => item.id === world)!

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
            <a href="#possibilities">The possibilities</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub <Arrow />
            </a>
          </nav>
          <a className="rf-button rf-button-small" href={editorHref()}>
            Launch editor <Arrow />
          </a>
        </div>
      </header>

      <main id="main">
        <section className="rf-shell rf-hero" aria-labelledby="hero-heading">
          <div className="rf-hero-copy">
            <p className="rf-eyebrow">
              <span className="rf-dot" /> A SPATIAL WORLDBUILDING & EVENT SANDBOX
            </p>
            <h1 id="hero-heading">
              Big ideas.
              <br />
              Built in
              <br />
              <span>your space.</span>
            </h1>
            <p className="rf-intro">
              Shape a miniature world — or stage an event venue.
              <br />
              Place booths and barriers, start a virtual attendee, and see how the layout shapes the flow.
            </p>
            <div className="rf-hero-actions">
              <a className="rf-button" href={editorHref(selected.id)}>
                {enterLabel(selected.id)} <Arrow />
              </a>
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
                <small>Worlds, venues, and simulation in one forge.</small>
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
              <i>01</i> SPATIAL CREATION
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
              Turn an empty hall into a job fair — or start from a laid-out template.
              <br />
              Every booth, barrier, and stage piece is an editable catalog prop.
            </p>
          </div>

          <div className="rf-event-steps" aria-label="Event venue workflow">
            <article>
              <span>01</span>
              <h3>Create</h3>
              <p>Open Empty Space or Job Fair and place furniture, booths, and wayfinding.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Configure</h3>
              <p>Assign simulation roles — entrance, registration, booth, stage, exit — without leaving the forge.</p>
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
              A city. A new frontier. A facility in motion.
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
                RealmForge connects creating with simulating — for worlds and events.
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
                    Send a robot to a destination — or start a virtual attendee through registration, booths, and exits.
                    Block a path and watch navigation find a new way through.
                  </p>
                  <span className="rf-feature-tags">
                    ROBOT ROUTES <b>·</b> ATTENDEE FLOW <b>·</b> DYNAMIC REPLANNING
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
                    the local library and export them as portable JSON.
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
            Your next venue
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
          </div>
          <p className="rf-final-note">Browser-based. No install to start building.</p>
        </section>
      </main>

      <footer className="rf-footer rf-shell">
        <div>
          <Brand />
          <p>A spatial worldbuilding, event venue & simulation project.</p>
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
