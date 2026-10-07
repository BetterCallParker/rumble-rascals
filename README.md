# RUMBLE RASCALS!

A comic-book party brawler for up to **8 players**, inspired by Gang Beasts and Party Animals. Built with three.js in the browser and an authoritative Node.js server.

Punch rascals until they're dizzy, **knock them out**, grab them with one hand and **drag them across the roof**, squeeze both triggers to **hoist them over your head**, then chuck them off the building. Last rascal standing wins the round. First to 3 rounds wins the match.

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000**, enter a name and hit **LET'S RUMBLE!**

- **Couch play:** plug in Xbox controllers and press **A** on each one to add a rascal. The keyboard can join too (press **ENTER**).
- **LAN / online play:** the server prints a `Network:` address. Friends open it in their browser. Everyone in the same **room code** is in the same arena. Share the URL (`?room=CODE`).
- **Weaker laptop?** Add `?q=low` to the URL (lower resolution, no shadows).
- Solo? Practice on the **TEST DUMMY**. A match starts once 2+ rascals are in the room and everyone presses **START/Menu** (or **ENTER**) to ready up.

## Controls

| Xbox controller | Keyboard | Action |
| --- | --- | --- |
| Left stick | WASD / arrows | Move |
| A | Space | Jump |
| X | J | Punch / swing weapon. Tap for a 3-hit combo, **hold to charge** a power hit |
| Y | K | Kick. In the air it's a **dropkick** |
| **LT** | Q / left mouse | **Left hand** grab (hold) |
| **RT** | E / right mouse | **Right hand** grab (hold) |
| **LT + RT** | Q + E | **Lift** the rascal you're holding over your head |
| X while holding | J while holding | Pummel (one hand), fling a dragged rascal, or throw a lifted one |
| B | Shift | Dodge roll (brief invulnerability) |
| RB | L | Block. Tap it just before a hit to **PARRY** |
| LB | T | Taunt |
| Menu | Enter | Ready up |
| View | H | Show controls |

### The fight loop

1. **Hit** a rascal to raise their **daze meter** (the bar under the damage % on their card). Damage % also makes them fly further.
2. When the daze meter fills, they're **KNOCKED OUT** (X-eyes, stars, Zzz) for about 6 seconds. Mashing buttons wakes them up sooner.
3. **One trigger** on a knocked-out rascal grabs them by the ankle and **drags** them behind you.
4. **Both triggers** hoist them overhead. Press **X** to throw them off the roof. That's a **RING OUT**.
5. A conscious rascal held in one hand can be pummeled with **X**, but they can mash to break free.

Weapons go in whichever hand grabbed them, so you can hold someone with one hand and bonk them with the other. Press that hand's trigger again to throw the weapon. Crates, tires and **BOOM BARRELS** take both hands. Throw them, or bat a barrel into someone for a big explosion. Watch out for the **wrecking ball**!

## Architecture

```
server/index.js   HTTP static server + WebSocket rooms, fixed 60 Hz simulation, 30 Hz snapshots
server/game.js    Authoritative game: combat, grabbing/lifting/dragging, KO, props, rounds, test dummy
shared/           Code shared by server and client (movement physics, arena, items, attack data)
client/js/
  main.js         Game client: interpolation, events -> effects, camera, controller joining
  predict.js      Client-side prediction: replays unacknowledged inputs through shared physics
  character.js    Procedural rascal model + spring-driven rubber-hose animation
  post.js         Comic post-processing: ink outlines, halftone dots, speed lines, impact frames
  fx.js           Dust, debris, impact bursts, shockwaves, explosions, swoosh trails
  hud.js          Comic HUD: player cards, POW! bursts, announcer, name tags
  audio.js        Procedurally synthesized cartoon sound effects (no audio files)
  input.js        Xbox controller (standard mapping, rumble) + keyboard input
```

- The **server is authoritative**: clients send only controller input. Everyone sees the same fight.
- Your own rascal is **predicted locally** with the exact same movement code the server runs, so movement responds instantly. It is then reconciled smoothly against the server. Other rascals are interpolated about 80 ms in the past for smooth motion.
- Hits use **hit-stop** (attacker and victim freeze for a few frames), screen shake, controller rumble, and comic onomatopoeia for that crunchy feel.

## Tests

```bash
npm test
```

These are headless simulation tests covering knockouts, dragging, lifting, throwing, the player cap, and dummy respawns.
