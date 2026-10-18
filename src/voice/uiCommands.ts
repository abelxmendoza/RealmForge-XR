import type { PalettePage } from '../xr/paletteUI'
import { parseAnchor, parseDirection, parseDistance } from './objectCommands'
import type { VoiceCommand } from './types'

/**
 * Voice grammar for getting around in the headset and for the robot's route (deterministic, no LLM):
 *
 *   go back · previous page                         palette back one page
 *   exit VR · leave AR · take me out of VR           end the immersive session
 *   hide / show / collapse / expand the menu         the Control Palette ("panel", "controls", "palette")
 *   open / hide the guide · hide everything          the guide, or every floating panel at once
 *   open the build page · open the object catalog    jump to a palette page
 *   add a waypoint at the goal / near the robot / here / 10 meters north of the robot
 *   remove the last waypoint · clear the waypoints · start / pause / stop the route · next stop
 *
 * Runs before the older rules, which also claim words like "resume", "start route" and "show routes".
 */

const PLEASE = String.raw`(?:(?:please|can you|could you|now)\s+)*`

export function parseUiCommand(t: string): VoiceCommand | null {
  if (new RegExp(String.raw`^${PLEASE}(?:go back|back|go back (?:a|one) page|back one page|previous page|last page|page back)(?: please)?$`).test(t))
    return { type: 'UI_BACK' }

  if (/\b(?:exit|leave|quit|close|end|stop)(?: the)? (?:vr|ar|xr|virtual reality|mixed reality|immersive(?: mode)?|headset(?: mode| view)?)\b/.test(t) || /\btake me out of (?:vr|ar|xr)\b/.test(t))
    return { type: 'EXIT_XR' }

  const panel = new RegExp(
    String.raw`^${PLEASE}(hide|close|dismiss|put away|show|open|bring back|bring up|bring|display|unhide|collapse|minimi[sz]e|fold|expand|maximi[sz]e|unfold)` +
      String.raw`(?: the| all(?: the)?| my)? (menu|palette|panel|control panel|controls|toolbar|guide|help|instructions|everything|all|panels|windows|menus)(?: back| up| again)?$`,
  ).exec(t)
  if (panel) {
    const [, verb, what] = panel
    const action = /hide|close|dismiss|put away/.test(verb) ? 'hide' : /collapse|minimi|fold/.test(verb) && verb !== 'unfold' ? 'collapse' : /expand|maximi|unfold/.test(verb) ? 'expand' : 'show'
    const target = /guide|help|instructions/.test(what) ? 'guide' : /everything|all|panels|windows|menus/.test(what) ? 'all' : 'menu'
    return { type: 'UI_PANEL', panel: target, action }
  }

  const page = parsePage(t)
  if (page) return { type: 'UI_OPEN_PAGE', page }
  return null
}

/** Unambiguous page names work bare ("open the object catalog"); short ones need "page" or "tab" ("open the view tab"). */
const PAGES: { words: RegExp; page: PalettePage; bare: boolean }[] = [
  { words: /object catalog|catalog|object library/, page: 'assets', bare: true },
  { words: /event objects/, page: 'events', bare: true },
  { words: /actors?/, page: 'actors', bare: true },
  { words: /actor settings/, page: 'actor-settings', bare: true },
  { words: /materials|brush/, page: 'brush', bare: true },
  { words: /saved worlds|my saves|load world/, page: 'saved', bare: true },
  { words: /real room|room settings/, page: 'room', bare: true },
  { words: /styles/, page: 'styles', bare: true },
  { words: /property scans|scans|scan sections/, page: 'scans', bare: true },
  { words: /plan routes|route planning|planning/, page: 'plan', bare: true },
  { words: /build|building tools/, page: 'build', bare: true },
  { words: /edit|editing tools/, page: 'edit', bare: true },
  { words: /simulate|simulation/, page: 'simulate', bare: false },
  { words: /plan|routes/, page: 'plan', bare: false },
  { words: /view|display/, page: 'view', bare: false },
  { words: /save|saving/, page: 'save', bare: false },
  { words: /events/, page: 'events', bare: false },
  { words: /room/, page: 'room', bare: false },
]

function parsePage(t: string): PalettePage | null {
  const m = new RegExp(String.raw`^${PLEASE}(?:open|show|go to|switch to|take me to)(?: the)? (.+?)( page| tab| section| menu)?$`).exec(t)
  if (!m) return null
  const [, name, suffix] = m
  for (const p of PAGES) {
    if (!new RegExp(String.raw`^(?:${p.words.source})$`).test(name)) continue
    if (p.bare || suffix) return p.page
  }
  return null
}

export function parseRouteCommand(t: string): VoiceCommand | null {
  if (/\b(?:remove|delete|undo|drop)(?: the)? (?:last|previous) (?:waypoint|way point|stop|route stop)\b/.test(t) || /\bundo (?:the )?waypoint\b/.test(t))
    return { type: 'ROUTE_REMOVE_LAST' }
  if (/\b(?:clear|delete|remove|reset)(?: all)?(?: the)? (?:waypoints|way points|stops|route stops|route plan|robot route|robot's route|route)\b/.test(t) && !/\bselected\b/.test(t))
    return { type: 'ROUTE_CLEAR' }
  if (/\b(?:next stop|next waypoint|skip (?:to )?(?:the )?next(?: stop| waypoint)?|skip (?:this |the )?(?:stop|waypoint))\b/.test(t)) return { type: 'ROUTE_NEXT' }
  // "start a route" / "start route" stay with Flow route drafting; "start the route" plays the robot's stops.
  if (new RegExp(String.raw`^${PLEASE}(?:start|play|run|begin|resume|continue)(?: the| the robot's| the robot| robot)? ?(?:route|tour|waypoints|stops)$`).test(t) && !/^(?:start|begin) (?:a )?route$/.test(t))
    return { type: 'ROUTE_PLAY' }
  if (new RegExp(String.raw`^${PLEASE}pause(?: the)? (?:route|robot route|tour|robot)$`).test(t)) return { type: 'ROUTE_PAUSE' }
  if (new RegExp(String.raw`^${PLEASE}stop(?: the)? (?:route|robot route|tour)$`).test(t)) return { type: 'ROUTE_STOP' }

  const add = new RegExp(String.raw`^${PLEASE}(?:add|place|put|drop|set|create|make|mark)(?: a| an| another| one more| new)? (?:waypoint|way point|route stop|stop)(?! sign)\b(.*)$`).exec(t)
  if (!add) return null
  const rest = add[1].trim()
  if (!rest || /\b(?:here|there|where i'?m pointing)\b/.test(rest)) return { type: 'ROUTE_ADD_WAYPOINT', here: true }
  const direction = parseDirection(rest)
  const anchor = parseAnchor(rest)
  const to = anchor && anchor !== 'auto' ? anchor : direction ? 'robot' : undefined
  if (!to && !direction) return { type: 'ROUTE_ADD_WAYPOINT', here: true }
  return { type: 'ROUTE_ADD_WAYPOINT', to, direction, distance: direction ? parseDistance(rest) : undefined }
}
