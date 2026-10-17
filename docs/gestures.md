# Hand gestures (Minority Report–style)

RealmForge's in-headset gestures are modelled on the interface in *Minority Report* (2002), designed by
John Underkoffler for the film and later developed into Oblong Industries' **g-speak** spatial operating
environment. The film interface is fiction, but the design principles behind it carry over well to hand
tracking on Quest. Below: the principles, the gesture vocabulary, and how it's built.

## Principles applied

| Principle | From | How it shows up here |
| --- | --- | --- |
| **Direct, continuous mapping** | g-speak: the hand *is* the cursor and the handle | The world follows your fists 1:1; an object turns exactly as far as your wrist rolls. Nothing is a "mode" you have to remember to leave. |
| **Two-handed, asymmetric roles** | Guiard's *kinematic chain* (1987), used throughout g-speak | Two hands define a *frame* (where to act); one hand then *acts* inside it (pinch-roll). Both hands together move the whole world. |
| **Pose → hold → act → release** | g-speak's pose grammar | A pose has to be held briefly (a dwell) before anything happens, so ordinary hand movement never fires commands. This is the "Midas touch" problem from eye-gaze interfaces. |
| **Constant, spatial feedback** | Film UI: everything glows, traces and follows your hands | An arrow grows along your finger while an L dwells, the frame rectangle draws between your hands, and objects highlight before they're selected. Rings mark your fists while you pull. |
| **Big, distinct poses** | Practical hand-tracking constraint | L, fist, pinch and frame are hard to confuse with each other or with rest poses, and have hysteresis so they don't flicker at the edges. |

## Gesture vocabulary

| Gesture | How | What it does |
| --- | --- | --- |
| **L (hold ~0.7 s)** | Thumb and index out at a right angle, other fingers curled; point your index along a real wall or direction | Sets the **primary axis**: the world turns about you so its main axis (grid, aisles, snapping) points that way. With snapping on it takes the nearest quarter turn, so it never spins the world around. An arrow grows along your finger; the new axis flashes on the floor. |
| **Two fists, pull** | Close both hands into fists in the air and move them | **Moves you through the world**: the world follows your fists on the floor at true scale and turns when you twist them. "Row" with repeated pulls to cross the 80 m map from a small room. |
| **Frame (hold ~0.4 s)** | Both hands in an L, mirrored like a photographer's frame (left index up / thumb right, right index down / thumb left) | **Selects as a group** everything whose centre is inside the frame as seen from your eyes. It previews in white while you hold, then the group turns cyan. |
| **Pinch + wrist roll** | Pinch thumb and index at something out of reach, then roll your wrist | **Selects and rotates** that object, or the whole group if it's part of one, about the group's centre. Snaps in 15° steps with snapping on. |
| Near grab (unchanged) | Pinch or fist *on* an object | Move it, twist to turn, two hands to scale (see the README). |
| Wrist menu (unchanged) | Left palm toward your face | Settings, scale, placement. With a group: **Duplicate / Delete / Clear**. **Gestures on/off** toggles all of the above. |

Priority: two fists > frame > one-hand gestures. A hand that is near-grabbing an object or using the
wrist menu is ignored, and pinch-rotate is skipped while rays are on (rays already pinch-drag).

## Controllers

Everything also works with Quest Touch / Touch Plus controllers. They trigger the same actions, with the
same hold-before-act rule (`src/xr/gestures/controllerInput.ts`):

| Controller | Same as | Does |
| --- | --- | --- |
| **Both grips** in empty air, move | Two fists | Pull the world past you; twist to turn it |
| **Both triggers**, hold ~0.4 s | Frame | Select everything between the two controllers as a group |
| **Hold A** ~0.7 s, aim the right controller | L | Set the primary axis to where it points |
| **Right trigger** at a distance, twist | Pinch + roll | Select and rotate; **right stick** flicks add 15° steps while held |
| **Right stick** left / right | – | Snap turn 30° |
| **Left stick** | – | Move through the world (1.5 m/s, true scale) |
| Grip **on** an object | Near grab | Move / turn / two-handed scale (unchanged) |
| Grip on a wrist-menu button | Poke | Press it (tilt the top of the left controller toward you to show the menu) |

With rays on (X / wrist menu) the triggers point and click instead, so frame and trigger-select pause.

## Walking past the boundary

The app asks for WebXR's `unbounded` reference space. Quest Browser supports it in mixed reality, and it
lets you walk past the play-area boundary. If the headset grants it, the dev log shows
`referenceSpace: 'unbounded'` in the "AR session started" line. If it still pauses when you walk out,
turn the boundary off for passthrough in the headset settings (under **Boundary**; the exact menu path
depends on the Horizon OS version). System pauses are recorded (`visibility` in the XR session meta), and
the world is kept as it was.

## How it's built

```
src/xr/gestures/handPose.ts      joints → features (pinch distance, finger straightness, L angle, palm normal, roll)
src/xr/gestures/recognizer.ts    pose → hold → act state machine, hysteresis, priorities (pure, time-driven)
src/xr/gestures/actions.ts       the maths: axis yaw, pull step, view-frame test, group rotation (pure)
src/xr/gestures/GestureController.tsx  reads XRFrame joints each frame, applies actions, draws feedback
src/editor/selection.ts          the framed group (ids + live preview)
src/xr/gestures/*.test.ts        synthetic hand skeletons (testHands.ts) for every pose and gesture
```

Each gesture that edits objects is a single undo step: it sets `dragging` while active, and history
merges everything in between.

## Tuning

Thresholds live in `POSE` (`handPose.ts`) and `DWELL` (`recognizer.ts`):
- pinch start and release distances
- finger straight and curled cut-offs
- the L angle range
- dwell times

`ROLL_GAIN` and `NEAR_GRAB` are in `GestureController.tsx`. If rotation feels reversed on your headset,
flip the sign of `ROLL_GAIN`.

**Known limits:**
- Quest hand tracking loses joints when hands overlap or leave the cameras' view. Keep your hands apart
  when framing, and in front of you.
- Selection uses object centres, so a large object whose centre is outside the frame isn't selected.
