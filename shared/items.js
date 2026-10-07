// Weapon & throwable definitions. Swing arcs are in degrees relative to facing
// (positive = to the player's left). 'side' swings sweep horizontally, 'slam' comes down overhead.

export const ITEMS = {
  bat: {
    type: 'weapon', label: 'SLUGGER', r: 0.32, len: 1.35, durability: 9,
    swing: { style: 'side', wind: 8, active: 7, rec: 13, dmg: 11, kb: 16, up: 7, from: 115, to: -85, hitR: 0.35 },
    throwDmg: 9, words: ['SMACK!', 'THWACK!', 'CRACK!', 'WHAM!'], sfx: 'wood',
  },
  hammer: {
    type: 'weapon', label: 'SLEDGE', r: 0.36, len: 1.3, durability: 7,
    swing: { style: 'slam', wind: 15, active: 6, rec: 20, dmg: 17, kb: 21, up: 11, from: 100, to: -10, hitR: 0.6 },
    throwDmg: 12, words: ['KRUNCH!', 'BONK!', 'KA-BLAM!'], sfx: 'metal',
  },
  pan: {
    type: 'weapon', label: 'FRYING PAN', r: 0.3, len: 1.0, durability: 12,
    swing: { style: 'side', wind: 5, active: 6, rec: 9, dmg: 8, kb: 12.5, up: 6, from: 100, to: -70, hitR: 0.45 },
    throwDmg: 8, words: ['CLANG!', 'DONNG!', 'PANG!'], sfx: 'pan',
  },
  fish: {
    type: 'weapon', label: 'WET FISH', r: 0.3, len: 1.1, durability: 14,
    swing: { style: 'side', wind: 4, active: 6, rec: 8, dmg: 5, kb: 15, up: 9, from: 100, to: -80, hitR: 0.4 },
    throwDmg: 5, words: ['SLAP!', 'FWAP!', 'SPLAT!'], sfx: 'slap',
  },
  sign: {
    type: 'weapon', label: 'STOP SIGN', r: 0.36, len: 2.0, durability: 8,
    swing: { style: 'side', wind: 12, active: 9, rec: 17, dmg: 13, kb: 19, up: 8, from: 130, to: -110, hitR: 0.5 },
    throwDmg: 10, words: ['STOP!', 'WHANGG!', 'KLANG!'], sfx: 'metal',
  },
  wrench: {
    type: 'weapon', label: 'WRENCH', r: 0.3, len: 1.05, durability: 11,
    swing: { style: 'side', wind: 6, active: 6, rec: 10, dmg: 9, kb: 13.5, up: 6, from: 105, to: -75, hitR: 0.38 },
    throwDmg: 10, words: ['KLONK!', 'CLANK!', 'TONK!'], sfx: 'metal',
  },
  crate: {
    type: 'heavy', label: 'CRATE', r: 0.55, throwDmg: 13, throwKb: 17, restitution: 0.2,
    breakOnHit: true, words: ['CRASH!', 'KRAK!'], sfx: 'wood',
  },
  barrel: {
    type: 'heavy', label: 'BOOM BARREL', r: 0.5, throwDmg: 6, throwKb: 10, restitution: 0.25,
    explosive: true, words: ['KA-BOOM!', 'BOOOM!', 'KABLOOEY!'], sfx: 'boom',
  },
  tire: {
    type: 'heavy', label: 'TIRE', r: 0.55, throwDmg: 9, throwKb: 18, restitution: 0.75,
    words: ['BOING!', 'BOUNCE!', 'THWUMP!'], sfx: 'rubber',
  },
};

export const WEAPON_KINDS = ['bat', 'hammer', 'pan', 'fish', 'sign', 'wrench'];
export const HEAVY_KINDS = ['crate', 'barrel', 'tire'];
export const ITEM_KIND_IDS = Object.keys(ITEMS);
