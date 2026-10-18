import { describe, expect, it } from 'vitest'
import { parseVoiceCommand } from '../commandParser'

const cmd = (t: string) => {
  const r = parseVoiceCommand(t)
  return r.ok ? r.command : null
}

describe('voice: getting around in the headset', () => {
  it('"go back" steps the palette back; "go back home" still goes home', () => {
    for (const t of ['Go back', 'back', 'previous page', 'please go back', 'go back a page']) expect(cmd(t), t).toEqual({ type: 'UI_BACK' })
    expect(cmd('go back home')).toMatchObject({ type: 'GO_HOME' })
    expect(cmd('go home')).toMatchObject({ type: 'GO_HOME' })
  })

  it('exits VR / AR', () => {
    for (const t of ['Exit VR', 'leave AR', 'exit the headset', 'take me out of VR', 'close XR']) expect(cmd(t), t).toEqual({ type: 'EXIT_XR' })
  })

  it('hides, shows, collapses and expands the menu, the guide or everything', () => {
    expect(cmd('hide the menu')).toEqual({ type: 'UI_PANEL', panel: 'menu', action: 'hide' })
    expect(cmd('show the menu')).toEqual({ type: 'UI_PANEL', panel: 'menu', action: 'show' })
    expect(cmd('bring the controls back')).toEqual({ type: 'UI_PANEL', panel: 'menu', action: 'show' })
    expect(cmd('collapse the palette')).toEqual({ type: 'UI_PANEL', panel: 'menu', action: 'collapse' })
    expect(cmd('expand the panel')).toEqual({ type: 'UI_PANEL', panel: 'menu', action: 'expand' })
    expect(cmd('open the guide')).toEqual({ type: 'UI_PANEL', panel: 'guide', action: 'show' })
    expect(cmd('close the help')).toEqual({ type: 'UI_PANEL', panel: 'guide', action: 'hide' })
    expect(cmd('hide everything')).toEqual({ type: 'UI_PANEL', panel: 'all', action: 'hide' })
    expect(cmd('hide all')).toEqual({ type: 'UI_PANEL', panel: 'all', action: 'hide' })
    expect(cmd('show all the windows')).toEqual({ type: 'UI_PANEL', panel: 'all', action: 'show' })
  })

  it('opens palette pages by name', () => {
    expect(cmd('open the object catalog')).toEqual({ type: 'UI_OPEN_PAGE', page: 'assets' })
    expect(cmd('go to the build page')).toEqual({ type: 'UI_OPEN_PAGE', page: 'build' })
    expect(cmd('open the view tab')).toEqual({ type: 'UI_OPEN_PAGE', page: 'view' })
    expect(cmd('open plan routes')).toEqual({ type: 'UI_OPEN_PAGE', page: 'plan' })
    expect(cmd('open the property scans')).toEqual({ type: 'UI_OPEN_PAGE', page: 'scans' })
  })

  it('leaves the existing commands alone', () => {
    expect(cmd('show routes')).toEqual({ type: 'FLOW_SHOW_ROUTES' })
    expect(cmd('hide routes')).toEqual({ type: 'FLOW_HIDE_ROUTES' })
    expect(cmd('open mars')).toMatchObject({ type: 'LOAD_ENVIRONMENT' })
    expect(cmd('start a route')).toEqual({ type: 'FLOW_CREATE_ROUTE' })
    expect(cmd('add waypoint here')).toEqual({ type: 'ROUTE_ADD_WAYPOINT', here: true })
    expect(cmd('resume')).toEqual({ type: 'RESUME_SESSION' })
    expect(cmd('delete the selected route')).toEqual({ type: 'FLOW_CLEAR_ROUTE' })
    expect(cmd('add a stop sign')).toMatchObject({ type: 'SPAWN_OBJECTS' })
  })
})

describe('voice: robot route stops', () => {
  it('adds waypoints at named places or offsets', () => {
    expect(cmd('add a waypoint at the goal')).toEqual({ type: 'ROUTE_ADD_WAYPOINT', to: 'goal', direction: undefined, distance: undefined })
    expect(cmd('place a stop near the robot')).toEqual({ type: 'ROUTE_ADD_WAYPOINT', to: 'robot', direction: undefined, distance: undefined })
    expect(cmd('add a waypoint 10 meters north of the robot')).toEqual({ type: 'ROUTE_ADD_WAYPOINT', to: 'robot', direction: 'north', distance: 10 })
    expect(cmd('add another waypoint in the center')).toMatchObject({ type: 'ROUTE_ADD_WAYPOINT', to: 'center' })
    expect(cmd('add a waypoint')).toEqual({ type: 'ROUTE_ADD_WAYPOINT', here: true })
  })

  it('edits and drives the route', () => {
    expect(cmd('remove the last waypoint')).toEqual({ type: 'ROUTE_REMOVE_LAST' })
    expect(cmd('undo waypoint')).toEqual({ type: 'ROUTE_REMOVE_LAST' })
    expect(cmd('clear the waypoints')).toEqual({ type: 'ROUTE_CLEAR' })
    expect(cmd('start the route')).toEqual({ type: 'ROUTE_PLAY' })
    expect(cmd('play route')).toEqual({ type: 'ROUTE_PLAY' })
    expect(cmd('resume the route')).toEqual({ type: 'ROUTE_PLAY' })
    expect(cmd('pause the route')).toEqual({ type: 'ROUTE_PAUSE' })
    expect(cmd('stop the route')).toEqual({ type: 'ROUTE_STOP' })
    expect(cmd('next stop')).toEqual({ type: 'ROUTE_NEXT' })
  })
})
