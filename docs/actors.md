# Actors

The Actors panel adds up to 32 independently configured workers, courier robots, and utility vehicles. The object catalog still contains the warehouse equipment and destination markers.

Choose a type and click clear ground to place it. Select an actor in the scene or Control actor list. Give it a name, color, dimensions and speed; then choose Set actor destination and click ground, or send it to a catalog destination marker. Stop, duplicate and delete apply to the selected actor. The original robot remains available in the same list.

In VR, open Actors in the floating controls. Place a type on the ground, cycle through the actor roster, choose a destination or open Actor settings for color, speed and size. Actor grabs use the existing hand interaction system. Names can be entered on desktop. The Routes page sends markers to the selected actor, or the original robot when no actor is selected.

Each type has its own procedural model and movement speed. Routes use the existing obstacle grid with clearance based on each actor's footprint. Editing obstacles replans routes. Actors currently do not avoid each other, simulate vehicle steering/physics, carry cargo or perform jobs.

World saves and JSON exports include live actor positions, headings, names, colors, dimensions, speeds and destinations. Loading resumes navigation toward saved destinations. Older worlds load with no additional actors. The optional actors field stays in version 1 of the world format; older app versions will not preserve it when resaving.

Authoring edits support undo/redo. Movement frames do not create edit history or mark the world dirty. Saving explicitly captures the current moving poses.

Validation: 178 automated tests and production build pass. Browser checks cover placement of all three types, renaming, independent settings and routing with no console errors. Physical headset interaction remains unverified.
