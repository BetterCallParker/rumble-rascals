// Playable characters. Stats are multipliers around 1.0:
//  speed  - run speed        weight - resists knockback      power - damage & knockback dealt
//  grit   - resists getting dazed / knocked out              grip  - harder to escape from their grabs
export const CHARACTERS = [
  { id: 'rascal', name: 'RASCAL', desc: 'Scrappy all-rounder', look: 'classic', size: 1.0, speed: 1.0, weight: 1.0, power: 1.0, grit: 1.0, grip: 1.0 },
  { id: 'bruiser', name: 'BRUISER', desc: 'Big, slow, hits like a truck', look: 'bruiser', size: 1.17, speed: 0.88, weight: 1.3, power: 1.18, grit: 1.1, grip: 1.1 },
  { id: 'zippy', name: 'ZIPPY', desc: 'Tiny speed demon', look: 'zippy', size: 0.85, speed: 1.15, weight: 0.8, power: 0.88, grit: 0.95, grip: 0.9 },
  { id: 'robo', name: 'ROBO-RUMBLER', desc: 'Heavy metal, steady servos', look: 'robot', size: 1.03, speed: 0.95, weight: 1.18, power: 1.05, grit: 1.15, grip: 1.0 },
  { id: 'scratch', name: 'SCRATCH', desc: 'Quick paws, nine lives', look: 'cat', size: 0.95, speed: 1.09, weight: 0.9, power: 0.97, grit: 1.05, grip: 0.95 },
  { id: 'rex', name: 'REX', desc: 'Dino with a mean streak', look: 'dino', size: 1.06, speed: 0.95, weight: 1.12, power: 1.12, grit: 1.0, grip: 1.0 },
  { id: 'quackers', name: 'QUACKERS', desc: 'Slippery duck, hard to KO', look: 'duck', size: 0.97, speed: 1.04, weight: 0.95, power: 0.94, grit: 1.3, grip: 0.95 },
  { id: 'grizz', name: 'GRIZZ', desc: 'Bear hugs you cannot escape', look: 'bear', size: 1.12, speed: 0.92, weight: 1.22, power: 1.08, grit: 1.05, grip: 1.45 },
];

export function charStats(i) {
  return CHARACTERS[i] || CHARACTERS[0];
}
