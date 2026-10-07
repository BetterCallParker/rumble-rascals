// Match settings the host can change in the lobby. Values are option indices.
export const SETTINGS = [
  { key: 'rounds', label: 'ROUNDS TO WIN', options: [1, 2, 3, 4, 5], def: 2 },
  { key: 'time', label: 'ROUND TIME', options: [60, 90, 120, 180, 0], labels: ['1:00', '1:30', '2:00', '3:00', 'NO LIMIT'], def: 1 },
  { key: 'items', label: 'ITEMS', options: [0, 0.5, 1, 1.8], labels: ['NONE', 'FEW', 'NORMAL', 'LOTS!'], def: 2 },
  { key: 'melee', label: 'MELEE WEAPONS', bool: true, def: 1 },
  { key: 'shooting', label: 'SHOOTING WEAPONS', bool: true, def: 1 },
  { key: 'fire', label: 'FIRE WEAPONS', bool: true, def: 1 },
  { key: 'acid', label: 'ACID WEAPONS', bool: true, def: 1 },
  { key: 'explosives', label: 'EXPLOSIVES', bool: true, def: 1 },
  { key: 'hazards', label: 'STAGE HAZARDS', bool: true, def: 1 },
  { key: 'kb', label: 'KNOCKBACK', options: [0.75, 1, 1.25, 1.5], labels: ['GENTLE', 'NORMAL', 'HIGH', 'BONKERS'], def: 1 },
  { key: 'ko', label: 'KO TOUGHNESS', options: [1.6, 1, 0.75, 0.55], labels: ['EASY', 'NORMAL', 'TOUGH', 'IRON JAW'], def: 1 },
  { key: 'supers', label: 'SUPER MOVES', bool: true, def: 1 },
  { key: 'stages', label: 'STAGES', options: ['rotate', 'random', 0, 1, 2, 3, 4], labels: ['ROTATE ALL', 'RANDOM', 'ROOFTOP', 'TRAIN', 'ICE FLOE', 'GEAR WORKS', 'CHASE RUN'], def: 0 },
];

export function defaultSettings() {
  const s = {};
  for (const d of SETTINGS) s[d.key] = d.def;
  return s;
}

export function settingValue(settings, key) {
  const d = SETTINGS.find((x) => x.key === key);
  if (!d) return undefined;
  const i = settings[key] ?? d.def;
  return d.bool ? !!i : d.options[i];
}

export function settingLabel(settings, key) {
  const d = SETTINGS.find((x) => x.key === key);
  const i = settings[key] ?? d.def;
  if (d.bool) return i ? 'ON' : 'OFF';
  return d.labels ? d.labels[i] : String(d.options[i]);
}

export function settingCount(key) {
  const d = SETTINGS.find((x) => x.key === key);
  return d ? (d.bool ? 2 : d.options.length) : 0;
}
