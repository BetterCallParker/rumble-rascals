// Attack definitions shared by server (hit logic) and client (animation timing).

export const ATTACKS = {
  jab1: { wind: 3, active: 4, rec: 9, dmg: 4, kb: 5, up: 2.5, reach: 0.95, h: 1.2, r: 0.55, lunge: 3.5, side: 0.25, words: ['POW!', 'BAP!', 'WHAP!'] },
  jab2: { wind: 3, active: 4, rec: 9, dmg: 4, kb: 5, up: 2.5, reach: 0.95, h: 1.2, r: 0.55, lunge: 3.5, side: -0.25, words: ['BIF!', 'POW!', 'BOP!'] },
  hook: { wind: 5, active: 5, rec: 16, dmg: 8, kb: 11, up: 7, reach: 1.05, h: 1.15, r: 0.65, lunge: 5.5, side: 0, words: ['SMACK!', 'WHAM!', 'KAPOW!'] },
  hay: { wind: 4, active: 6, rec: 18, dmg: 7, kb: 12, up: 6, reach: 1.15, h: 1.2, r: 0.7, lunge: 6, side: 0, words: ['KA-POW!', 'BLAMMO!', 'SOCK!'] },
  kick: { wind: 6, active: 5, rec: 14, dmg: 7, kb: 13, up: 6, reach: 1.15, h: 0.7, r: 0.6, lunge: 4, side: 0, words: ['THUD!', 'WHUMP!', 'BOOT!'] },
  dk: { wind: 4, active: 46, rec: 0, dmg: 11, kb: 19, up: 7, reach: 0.65, h: 0.75, r: 0.7, lunge: 0, side: 0, words: ['DROPKICK!', 'KA-THUNK!', 'WHAMMO!'] },
  grab: { wind: 2, active: 7, rec: 12 },
  // sprint + X: shoulder-first spear tackle
  spear: { wind: 4, active: 16, rec: 18, dmg: 9, kb: 15, up: 6, reach: 0.75, h: 1.0, r: 0.75, lunge: 0, side: 0, words: ['SPEAR!', 'TACKLED!', 'OOF!'] },
  // sprint + Y: feet-first slide that sweeps legs out
  slide: { wind: 2, active: 22, rec: 14, dmg: 6, kb: 8, up: 9, reach: 0.7, h: 0.3, r: 0.65, lunge: 0, side: 0, words: ['SWEEP!', 'TRIPPED!', 'WHOOPS!'] },
  // in the air + BLOCK: butt-first ground pound
  pound: { wind: 9, active: 60, rec: 14, dmg: 12, kb: 13, up: 8, reach: 0, h: 0.1, r: 0.75, lunge: 0, side: 0, words: ['STOMP!', 'KA-THOOM!', 'SQUASH!'] },
};

// SPIN-O-RAMA super move
export const SUPER = { MAX: 100, TICKS: 96, RADIUS: 1.75, REHIT: 18, DMG: 6, KB: 14, UP: 7 };

export const CHARGE_MAX = 55; // ticks to reach full charge
export const CHARGE_GRACE = 7; // ticks of charge that still count as a tap

export function chargeAmount(ticks) {
  const c = (ticks - CHARGE_GRACE) / (CHARGE_MAX - CHARGE_GRACE);
  return c < 0 ? 0 : c > 1 ? 1 : c;
}
