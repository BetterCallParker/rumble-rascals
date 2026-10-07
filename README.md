# RUMBLE RASCALS!

A comic-book party brawler for up to **8 players**, inspired by Gang Beasts and Party Animals. Built with three.js in the browser and an authoritative Node.js server.

Punch rascals until they're dizzy, **knock them out**, drag them by the ankle, hoist them over your head and chuck them off the stage. Or grab a blunderbuss, a flamethrower or a stick of dynamite. Every player gets their **own third-person camera**, and couch players get **split-screen**.

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000**, enter a name and hit **LET'S RUMBLE!** You land in **the lobby**.

- **Lobby:** pick one of 8 characters, choose a hat, face gear and color, then press **A / ENTER** to ready up. The match starts when 2+ rascals are in and everyone is ready. Press **Y / P** to practice on the stage (with the **TEST DUMMY**) while you wait.
- **Host settings:** the first player in the room is the host. Press **VIEW / N**, or click a setting. Options: rounds to win, round time, item amount, each weapon category (melee, shooting, fire, acid, explosives), stage hazards, knockback, KO toughness, supers, and the stage (rotate / random / pick one).
- **Couch play:** plug in Xbox controllers and press **A** on each one. Every local player gets their own split-screen camera (up to 8). The keyboard can join too (press **ENTER**).
- **LAN / online play:** the server prints a `Network:` address. Friends open it in their browser. Everyone in the same **room code** is in the same lobby. Share the URL (`?room=CODE`).
- **Weaker laptop?** Add `?q=low` to the URL (lower resolution, no shadows).

## Stages

| Stage | What's going on |
| --- | --- |
| **Rooftop Rumble** | Big roof, crane pallet lift, moving platforms, bounce pads, swinging wrecking ball |
| **Freight Frenzy** | Brawl on top of a speeding train. Duck the signal beams! |
| **Ice Floe Fiasco** | Slippery ice, drifting floes, falling snowballs |
| **Gear Works** | Conveyor belts, a crusher, pistons and a shuttle over the pit |
| **Steamroller Stampede** | A **race**: run for the finish line with a steamroller behind you. Knock rivals back so they get flattened. Last one standing (or first across the line) wins |

The out-of-bounds line is far below each stage. If you get knocked off, **hold a trigger against a wall to cling, then climb back up** (watch your stamina bar).

## Controls

Movement is camera-relative: push up to run away from your camera.

| Xbox controller | Keyboard + mouse | Action |
| --- | --- | --- |
| Left stick | WASD | Move (keep running to **sprint**) |
| Right stick | Mouse (click to lock) / arrows | Turn your camera |
| D-pad up / down | Wheel or - / = | Zoom camera in / out |
| A | Space | Jump. Climb up a ledge |
| X | J | Punch / swing / shoot. Tap for a combo, **hold to charge** |
| Y | K | Kick. In the air: **dropkick**. While sprinting: **slide tackle** |
| Sprint + X | Sprint + J | **Spear tackle** |
| **LT** | Q / left mouse | **Left hand** grab (hold). Hold against a wall to cling |
| **RT** | E / right mouse | **Right hand** grab (hold) |
| **LT + RT** | Q + E | **Lift** a rascal (or a heavy object) over your head |
| X while holding | J while holding | Pummel, fling a dragged rascal, or throw a lifted one |
| B | Shift | Dodge roll (also puts out fire!) |
| RB | L | Block (drains your guard meter). Tap right before a hit to **PARRY**. In the air: **ground pound** |
| LB | T | Taunt. When your SUPER meter is full: **SPIN-O-RAMA** |
| View | H | Help (in the lobby: host settings / leave practice) |
| | M | Music on / off |

### The fight loop

1. **Hit** a rascal to fill their **daze meter**. It takes a good beating to knock someone out. Damage % makes them fly further.
2. When the daze meter fills they're **KNOCKED OUT** for a few seconds. Mashing wakes them up sooner.
3. **One trigger** on a knocked-out rascal drags them by the ankle. **Both triggers** hoist them overhead. Press **X** to throw them off the stage.
4. **Blocking** stops damage but drains your guard. Run it dry and you get **GUARD BROKEN**.
5. Landing hits fills your **SUPER** meter.

**Everything is pickupable.** There are 48 items in categories the host can toggle:

- **Melee:** bats, sledges, frying pans, fish, guitars, and more.
- **Throwables:** crates, anvils, bowling balls, pies, banana peels, penguins, and more.
- **Shooting:** pop pistol, blunderbuss, ray gun.
- **Fire:** flamethrower, torch.
- **Acid:** acid sprayer, acid flask puddles.
- **Explosives:** rocket launcher, grenades, bombs, TNT, boom barrels. A lit fuse stays lit if somebody catches it!

## Architecture

```
server/index.js   HTTP static server + WebSocket rooms, fixed 60 Hz simulation, 30 Hz snapshots
server/game.js    Authoritative game: combat, guard/parry, grabbing, KO, climbing, items, guns,
                  status effects, hazards, race mode, lobby/ready-up, host settings, rounds
shared/           Code shared by server and client: physics, levels + moving platforms, items,
                  characters, settings, cosmetics, attack data
client/js/
  main.js         Client: interpolation, events -> effects, per-player cameras, split-screen
  cameras.js      Third-person follow cameras (wall avoidance, lazy follow) + viewport layout
  lobby.js        Lobby screen: character select, cosmetics, ready-up, host settings, portraits
  levels.js       Stage builders, themed set dressing, hazard visuals
  predict.js      Client-side prediction through the shared physics (moving platforms too)
  character.js    Procedural rascal models (8 characters, hats, face gear) + rubber-hose animation
  props.js        Item and projectile models
  post.js         Comic post-processing (multi-viewport): ink outlines, halftone, speed lines
  fx.js           Particles: dust, impacts, explosions, flames, acid, muzzle flashes, trails
  hud.js          Comic HUD: cards with daze/guard/super meters, POW! bursts, race bar
  audio.js        Synthesized sound effects + procedural music (one song per stage)
  input.js        Xbox controller (standard mapping, rumble) + keyboard/mouse
```

- The **server is authoritative**: clients send controller input plus their camera's aim direction. Everyone sees the same fight.
- Your own rascal is **predicted locally** with the same movement code the server runs, so movement responds instantly. Other rascals are interpolated about 80 ms in the past.
- Hits use **hit-stop**, camera shake, controller rumble and comic onomatopoeia for that crunchy feel.

## Tests

```bash
npm test
```

These are headless simulation tests. They cover:

- Knockouts (KOs take multiple hits), dragging, lifting and throwing.
- Blocking, parry and guard break.
- Guns, fire and acid, and explosives.
- Wall climbing, moving platforms and bounce pads.
- The race mode, host settings and the lobby flow.
