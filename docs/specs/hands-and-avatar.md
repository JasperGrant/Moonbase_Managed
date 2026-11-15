# Spec: hands, throwing and an animated astronaut

## Want

- The astronaut seen from the rover camera moves like a person: legs walk when they walk, arms swing, they crouch when the player crouches, and their arms reach where the player's hands are. No T-pose.
- In VR, hold a controller's trigger on a tool and the tool is in that hand. Let go of the trigger and the tool leaves the hand at once.
- A tool that leaves the hand keeps the hand's speed, so the player can throw it. It falls in lunar gravity, bounces a little and comes to rest on the ground.
- A tool is in one of three places: where it first hangs (the locker rack), in a hand, or on the ground where it came to rest. It can be picked up off the ground again.
- Each hand holds one tool.

## Not wanted

- The tool belt. Nothing rides at the waist, and nothing snaps back anywhere when it is let go.

## Done when

- In the rover camera the astronaut walks, swings their arms and holds their tools in their hands, and tools lying on the ground are visible.
- In `npm run vr`: a trigger on a tool picks it up; releasing it with the hand moving throws it; it lands on the ground; it can be picked up again and used for a repair.
- The demo mission can still be won from a laptop (`npm run smoke`).
- Mission Ops sees what is in each hand, and which tools are lying out.

## Supersedes

`SPEC-v2.md`: "Tools and the belt" (the weight limit and the belt), the belt part of "What each seat sees" for the Astronaut and Mission Ops, and "Grab" under controls (the trigger now grabs too).
