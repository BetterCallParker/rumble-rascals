// Every loose object in a level is one of these. All of them can be picked up.
//  weapon: one hand, X swings it, press that hand's trigger again to throw it
//  heavy:  both hands, carried overhead, X (or a trigger) throws it
//  light:  one hand, X (or that hand's trigger) throws it fast
//  gun:    one hand, X shoots it
// Swing arcs are in degrees relative to facing; 'side' sweeps horizontally, 'slam' comes down overhead.

const side = (wind, active, rec, dmg, kb, up, from, to, hitR) => ({ style: 'side', wind, active, rec, dmg, kb, up, from, to, hitR });
const slam = (wind, active, rec, dmg, kb, up, hitR) => ({ style: 'slam', wind, active, rec, dmg, kb, up, from: 100, to: -10, hitR });

export const ITEMS = {
  // ---------------------------------------------------------------- weapons
  bat: { type: 'weapon', cat: 'melee', label: 'SLUGGER', r: 0.32, len: 1.35, durability: 9, swing: side(8, 7, 13, 11, 15, 7, 115, -85, 0.35), throwDmg: 9, words: ['SMACK!', 'THWACK!', 'CRACK!', 'WHAM!'], sfx: 'wood' },
  hammer: { type: 'weapon', cat: 'melee', label: 'SLEDGE', r: 0.36, len: 1.3, durability: 7, swing: slam(15, 6, 20, 16, 19, 11, 0.6), throwDmg: 12, words: ['KRUNCH!', 'BONK!', 'KA-BLAM!'], sfx: 'metal' },
  pan: { type: 'weapon', cat: 'melee', label: 'FRYING PAN', r: 0.3, len: 1.0, durability: 12, swing: side(5, 6, 9, 8, 12, 6, 100, -70, 0.45), throwDmg: 8, words: ['CLANG!', 'DONNG!', 'PANG!'], sfx: 'pan' },
  fish: { type: 'weapon', cat: 'melee', label: 'WET FISH', r: 0.3, len: 1.1, durability: 14, swing: side(4, 6, 8, 5, 14, 9, 100, -80, 0.4), throwDmg: 5, words: ['SLAP!', 'FWAP!', 'SPLAT!'], sfx: 'slap' },
  sign: { type: 'weapon', cat: 'melee', label: 'STOP SIGN', r: 0.36, len: 2.0, durability: 8, swing: side(12, 9, 17, 12, 17, 8, 130, -110, 0.5), throwDmg: 10, words: ['STOP!', 'WHANGG!', 'KLANG!'], sfx: 'metal' },
  wrench: { type: 'weapon', cat: 'melee', label: 'WRENCH', r: 0.3, len: 1.05, durability: 11, swing: side(6, 6, 10, 9, 13, 6, 105, -75, 0.38), throwDmg: 10, words: ['KLONK!', 'CLANK!', 'TONK!'], sfx: 'metal' },
  plank: { type: 'weapon', cat: 'melee', label: 'PLANK', r: 0.34, len: 1.75, durability: 6, swing: side(9, 8, 14, 10, 15, 7, 120, -95, 0.42), throwDmg: 9, words: ['WHACK!', 'THWOMP!', 'KRAK!'], sfx: 'wood' },
  chair: { type: 'weapon', cat: 'melee', label: 'FOLDING CHAIR', r: 0.4, len: 1.2, durability: 5, swing: slam(12, 6, 18, 14, 17, 10, 0.65), throwDmg: 12, words: ['KRANG!', 'CHAIR SHOT!', 'KLANK!'], sfx: 'metal' },
  guitar: { type: 'weapon', cat: 'melee', label: 'GUITAR', r: 0.38, len: 1.45, durability: 3, swing: side(10, 8, 15, 15, 18, 8, 125, -90, 0.48), throwDmg: 11, words: ['KRANNNG!', 'TWANG!', 'ROCK ON!'], sfx: 'guitar' },
  chicken: { type: 'weapon', cat: 'melee', label: 'RUBBER CHICKEN', r: 0.3, len: 1.0, durability: 30, swing: side(3, 5, 6, 3, 15, 9, 95, -80, 0.4), throwDmg: 3, words: ['SQUEAK!', 'BAWK!', 'BUH-GAWK!'], sfx: 'squeak' },
  cone: { type: 'weapon', cat: 'melee', label: 'TRAFFIC CONE', r: 0.34, len: 0.95, durability: 10, swing: side(5, 6, 9, 6, 12, 6, 100, -75, 0.45), throwDmg: 6, words: ['BONK!', 'PLONK!', 'DOINK!'], sfx: 'rubber' },
  plunger: { type: 'weapon', cat: 'melee', label: 'PLUNGER', r: 0.3, len: 1.1, durability: 12, swing: side(5, 6, 9, 6, 11, 6, 100, -75, 0.4), throwDmg: 5, words: ['SHLOOP!', 'PLORP!', 'SHLUK!'], sfx: 'slap' },
  golfclub: { type: 'weapon', cat: 'melee', label: 'GOLF CLUB', r: 0.3, len: 1.5, durability: 9, swing: side(10, 6, 14, 8, 20, 12, 130, -60, 0.36), throwDmg: 7, words: ['FORE!', 'THWIP!', 'HOLE IN ONE!'], sfx: 'metal' },
  mallet: { type: 'weapon', cat: 'melee', label: 'GIANT MALLET', r: 0.42, len: 1.4, durability: 8, swing: slam(14, 6, 19, 15, 19, 12, 0.75), throwDmg: 12, words: ['BONK!', 'KA-BONK!', 'WHOMP!'], sfx: 'wood' },
  broom: { type: 'weapon', cat: 'melee', label: 'BROOM', r: 0.32, len: 1.7, durability: 10, swing: side(7, 8, 11, 5, 14, 7, 120, -100, 0.45), throwDmg: 5, words: ['SWISH!', 'SWEEP!', 'FWOOSH!'], sfx: 'wood' },
  lollipop: { type: 'weapon', cat: 'melee', label: 'GIANT LOLLIPOP', r: 0.34, len: 1.3, durability: 9, swing: side(6, 7, 10, 8, 13, 7, 110, -85, 0.5), throwDmg: 7, words: ['SWIRL!', 'SUGAR RUSH!', 'BONK!'], sfx: 'wood' },
  shovel: { type: 'weapon', cat: 'melee', label: 'SHOVEL', r: 0.32, len: 1.45, durability: 9, swing: side(8, 7, 13, 11, 15, 7, 115, -85, 0.42), throwDmg: 9, words: ['CLANG!', 'SHUNK!', 'DONG!'], sfx: 'pan' },
  pipe: { type: 'weapon', cat: 'melee', label: 'LEAD PIPE', r: 0.3, len: 1.3, durability: 10, swing: side(7, 6, 12, 11, 14, 6, 110, -80, 0.36), throwDmg: 10, words: ['KLANG!', 'TONNG!', 'KLUNK!'], sfx: 'metal' },
  hockeystick: { type: 'weapon', cat: 'melee', label: 'HOCKEY STICK', r: 0.32, len: 1.6, durability: 9, swing: side(8, 6, 12, 8, 18, 9, 125, -70, 0.42), throwDmg: 7, words: ['SLAPSHOT!', 'SCORE!', 'THWACK!'], sfx: 'wood' },

  // ---------------------------------------------------------------- heavy (both hands, overhead)
  crate: { type: 'heavy', cat: 'throwable', label: 'CRATE', r: 0.55, throwDmg: 12, throwKb: 15, restitution: 0.2, breakOnHit: true, words: ['CRASH!', 'KRAK!'], sfx: 'wood' },
  barrel: { type: 'heavy', cat: 'explosives', label: 'BOOM BARREL', r: 0.5, throwDmg: 6, throwKb: 10, restitution: 0.25, explosive: 4.6, words: ['KA-BOOM!', 'BOOOM!', 'KABLOOEY!'], sfx: 'boom' },
  tnt: { type: 'heavy', cat: 'explosives', label: 'TNT CRATE', r: 0.5, throwDmg: 6, throwKb: 10, restitution: 0.15, explosive: 5.4, words: ['KA-BLAMMO!', 'KABOOOM!', 'DYNAMITE!'], sfx: 'boom' },
  tire: { type: 'heavy', cat: 'throwable', label: 'TIRE', r: 0.55, throwDmg: 8, throwKb: 16, restitution: 0.75, words: ['BOING!', 'BOUNCE!', 'THWUMP!'], sfx: 'rubber' },
  watermelon: { type: 'heavy', cat: 'throwable', label: 'WATERMELON', r: 0.45, throwDmg: 9, throwKb: 12, restitution: 0.1, breakOnHit: true, splat: true, words: ['SPLOOSH!', 'SPLAT!', 'SQUELCH!'], sfx: 'splat' },
  bowlingball: { type: 'heavy', cat: 'throwable', label: 'BOWLING BALL', r: 0.4, carryMul: 0.65, throwSpeed: 14, throwDmg: 13, throwKb: 19, restitution: 0.12, friction: 0.97, words: ['STRIKE!', 'KA-THUNK!', 'SPARE!'], sfx: 'wood' },
  beachball: { type: 'heavy', cat: 'throwable', label: 'BEACH BALL', r: 0.55, carryMul: 0.95, throwSpeed: 18, throwDmg: 2, throwKb: 17, restitution: 0.88, words: ['BOING!', 'BOINK!', 'BLOOP!'], sfx: 'rubber' },
  anvil: { type: 'heavy', cat: 'throwable', label: 'ANVIL', r: 0.48, carryMul: 0.48, throwSpeed: 10.5, throwDmg: 20, throwKb: 22, restitution: 0.05, words: ['KLANNNG!', 'DOINK!', 'ANVIL!'], sfx: 'metal' },
  trashcan: { type: 'heavy', cat: 'throwable', label: 'TRASH CAN', r: 0.5, throwDmg: 9, throwKb: 14, restitution: 0.3, words: ['CLATTER!', 'KRASH!', 'BANG!'], sfx: 'metal' },
  iceblock: { type: 'heavy', cat: 'throwable', label: 'ICE BLOCK', r: 0.5, throwDmg: 11, throwKb: 15, restitution: 0.1, friction: 0.995, breakOnHit: true, words: ['KRISSH!', 'SHATTER!', 'BRRR!'], sfx: 'glass' },
  penguin: { type: 'heavy', cat: 'throwable', label: 'PENGUIN', r: 0.5, carryMul: 0.85, throwDmg: 7, throwKb: 15, restitution: 0.4, words: ['SQUAWK!', 'WADDLE!', 'NOOT NOOT!'], sfx: 'squeak' },

  // ---------------------------------------------------------------- light throwables (one hand)
  tomato: { type: 'light', cat: 'throwable', label: 'TOMATO', r: 0.2, throwDmg: 2, throwKb: 6, breakOnHit: true, splat: true, words: ['SPLAT!', 'SPLORT!', 'SQUISH!'], sfx: 'splat' },
  brick: { type: 'light', cat: 'throwable', label: 'BRICK', r: 0.22, throwDmg: 8, throwKb: 10, restitution: 0.1, words: ['THUNK!', 'KLUNK!', 'BONK!'], sfx: 'wood' },
  snowball: { type: 'light', cat: 'throwable', label: 'SNOWBALL', r: 0.22, throwDmg: 3, throwKb: 8, breakOnHit: true, splat: true, words: ['POOF!', 'FWUMP!', 'BRRR!'], sfx: 'snow' },
  coal: { type: 'light', cat: 'throwable', label: 'LUMP OF COAL', r: 0.2, throwDmg: 5, throwKb: 8, restitution: 0.2, words: ['KLUNK!', 'THUD!', 'NAUGHTY!'], sfx: 'wood' },
  gear: { type: 'light', cat: 'throwable', label: 'GEAR', r: 0.24, throwDmg: 6, throwKb: 9, restitution: 0.3, words: ['KLINK!', 'KA-CHUNK!', 'CLANG!'], sfx: 'metal' },
  banana: { type: 'light', cat: 'throwable', label: 'BANANA PEEL', r: 0.2, throwDmg: 1, throwKb: 4, restitution: 0.05, trap: true, words: ['WHOOPS!', 'WHOA!', 'SLIP!'], sfx: 'slap' },
  duck: { type: 'light', cat: 'throwable', label: 'RUBBER DUCK', r: 0.2, throwDmg: 2, throwKb: 6, restitution: 0.6, words: ['QUACK!', 'SQUEAK!', 'QUACK QUACK!'], sfx: 'squeak' },
  pie: { type: 'light', cat: 'throwable', label: 'CREAM PIE', r: 0.22, throwDmg: 1, throwKb: 4, breakOnHit: true, splat: true, pie: true, words: ['SPLORCH!', 'PIE FACE!', 'SPLAT!'], sfx: 'splat' },
};

// ---------------------------------------------------------------- shooting / fire / acid / explosives
// guns: one hand, X fires (flamethrower & acid squirter fire while held), press that hand's trigger to toss it
Object.assign(ITEMS, {
  poppistol: {
    type: 'gun', cat: 'shooting', label: 'POP PISTOL', r: 0.28, len: 0.7, ammo: 10, rate: 13,
    bullet: { kind: 'cork', speed: 34, dmg: 5, kb: 12, up: 4, life: 40, r: 0.2 }, throwDmg: 5, words: ['POP!', 'BLAM!', 'PEW!'], sfx: 'pop',
  },
  blunderbuss: {
    type: 'gun', cat: 'shooting', label: 'BLUNDERBUSS', r: 0.32, len: 1.0, ammo: 5, rate: 42, pellets: 6, spread: 0.3, recoil: 7,
    bullet: { kind: 'pellet', speed: 30, dmg: 3, kb: 7, up: 3, life: 18, r: 0.17 }, throwDmg: 7, words: ['KA-BLAM!', 'BOOM!', 'KA-POW!'], sfx: 'shotgun',
  },
  raygun: {
    type: 'gun', cat: 'shooting', label: 'RAY GUN', r: 0.28, len: 0.8, ammo: 14, rate: 9,
    bullet: { kind: 'ray', speed: 46, dmg: 4, kb: 9, up: 5, life: 34, r: 0.22, daze: 3 }, throwDmg: 5, words: ['ZAP!', 'ZORT!', 'PEW PEW!'], sfx: 'zap',
  },
  rocket: {
    type: 'gun', cat: 'explosives', label: 'ROCKET LAUNCHER', r: 0.36, len: 1.3, ammo: 3, rate: 55, recoil: 6,
    bullet: { kind: 'rocket', speed: 22, dmg: 0, kb: 0, up: 0, life: 110, r: 0.3, explode: 3.8 }, throwDmg: 8, words: ['FWOOOSH!', 'KA-BOOM!'], sfx: 'rocket',
  },
  flamethrower: {
    type: 'gun', cat: 'fire', label: 'FLAMETHROWER', r: 0.34, len: 1.1, ammo: 150, rate: 3, auto: true, spread: 0.16,
    bullet: { kind: 'flame', speed: 12, dmg: 0.6, kb: 1.6, up: 0.6, life: 22, r: 0.5, burn: 150, pierce: true }, throwDmg: 6, words: ['FWOOOSH!', 'ROAST!', 'TOASTY!'], sfx: 'flame',
  },
  acidgun: {
    type: 'gun', cat: 'acid', label: 'ACID SQUIRTER', r: 0.3, len: 0.9, ammo: 90, rate: 4, auto: true, spread: 0.1,
    bullet: { kind: 'acid', speed: 19, dmg: 1, kb: 2.5, up: 1, life: 28, r: 0.26, acid: 170, gravity: true }, throwDmg: 4, words: ['SPLOOSH!', 'SIZZLE!', 'ICKY!'], sfx: 'acid',
  },
  torch: {
    type: 'weapon', cat: 'fire', label: 'TIKI TORCH', r: 0.3, len: 1.25, durability: 10, ignite: 150,
    swing: side(7, 7, 12, 7, 12, 6, 110, -80, 0.42), throwDmg: 6, words: ['FWOOSH!', 'SIZZLE!', 'HOT HOT HOT!'], sfx: 'flame',
  },
  grenade: {
    type: 'light', cat: 'explosives', label: 'GRENADE', r: 0.2, throwDmg: 2, throwKb: 5, restitution: 0.45, fuseOnThrow: 95,
    explosive: 3.8, words: ['KA-BOOM!', 'BLAMMO!', 'KABLOOEY!'], sfx: 'boom',
  },
  bomb: {
    type: 'heavy', cat: 'explosives', label: 'CARTOON BOMB', r: 0.48, carryMul: 0.85, throwDmg: 4, throwKb: 8, restitution: 0.35,
    fuseOnThrow: 120, explosive: 5.4, words: ['KA-BLAMMO!', 'BOOOOM!', 'KAPOW!'], sfx: 'boom',
  },
  acidflask: {
    type: 'light', cat: 'acid', label: 'ACID FLASK', r: 0.2, throwDmg: 2, throwKb: 4, breakOnHit: true, puddle: 2.3,
    words: ['SPLASH!', 'SIZZLE!', 'GLOOP!'], sfx: 'glass',
  },
});

export const CATEGORIES = ['melee', 'shooting', 'fire', 'acid', 'explosives', 'throwable'];

export const ITEM_KIND_IDS = Object.keys(ITEMS);

export function isOneHanded(def) {
  return def.type !== 'heavy';
}

// Item pool with the host's disabled categories removed
export function filterPool(pool, enabledCats) {
  const out = {};
  for (const k in pool) {
    const def = ITEMS[k];
    if (def && enabledCats.has(def.cat)) out[k] = pool[k];
  }
  return out;
}

// Weighted random pick from a level's item pool
export function pickFromPool(pool, rand = Math.random) {
  let total = 0;
  for (const k in pool) total += pool[k];
  let r = rand() * total;
  for (const k in pool) {
    r -= pool[k];
    if (r <= 0) return k;
  }
  return Object.keys(pool)[0];
}
