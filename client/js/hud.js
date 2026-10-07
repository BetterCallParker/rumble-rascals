// DOM-based comic HUD: per-viewport name tags & POW! bursts, player cards, announcer,
// race progress bar, help panel.
import * as THREE from 'three';
import { COLORS, ST, PHASE } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { ITEMS } from '/shared/items.js';
import { LEVELS } from '/shared/levels.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const _v = new THREE.Vector3();

const BURST_COLORS = [
  ['#ffd21f', '#ef2f2a'],
  ['#ffffff', '#ef2f2a'],
  ['#2fd4ff', '#ffd21f'],
  ['#ff6fb5', '#ffffff'],
  ['#ffd21f', '#2f6cf0'],
  ['#ef2f2a', '#ffd21f'],
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function burstPoints(n = 14) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = (i % 2 ? 58 : 100) * (0.85 + Math.random() * 0.3);
    const a = (i / (n * 2)) * Math.PI * 2;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r * 0.75).toFixed(1)}`);
  }
  return pts.join(' ');
}

function makeWordEl(text, opts) {
  const size = opts.size || 46;
  const [fill, bg] = opts.colors;
  const w = el('div', 'pow' + (opts.plain ? ' plain' : ''));
  const inner = el('div', 'inner');
  inner.style.setProperty('--s', size + 'px');
  inner.style.setProperty('--r', opts.rot + 'deg');
  inner.style.setProperty('--c', fill);
  inner.style.setProperty('--dur', (opts.dur || 0.9) + 's');
  if (!opts.plain) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '-110 -85 220 170');
    svg.setAttribute('preserveAspectRatio', 'none');
    const shadow = document.createElementNS(svgNS, 'polygon');
    shadow.setAttribute('points', opts.pts);
    shadow.setAttribute('fill', '#15101e');
    shadow.setAttribute('transform', 'translate(8 8)');
    const poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', opts.pts);
    poly.setAttribute('fill', bg);
    poly.setAttribute('stroke', '#15101e');
    poly.setAttribute('stroke-width', '7');
    poly.setAttribute('stroke-linejoin', 'round');
    svg.append(shadow, poly);
    inner.appendChild(svg);
  }
  inner.appendChild(el('span', '', text));
  w.appendChild(inner);
  return w;
}

export class Hud {
  constructor() {
    this.views = $('views');
    this.cards = $('cards');
    this.announceEl = $('announce');
    this.phaseEl = $('phase');
    this.joinbar = $('joinbar');
    this.netEl = $('net');
    this.roomEl = $('roomtag');
    this.helpEl = $('help');
    this.flashEl = $('flash');
    this.raceEl = $('race');
    this.words = [];
    this.vps = []; // per viewport { box, labels, fx, tags: Map, caption }
    this.cardEls = new Map();
    this.lastDamage = new Map();
    this.flashV = 0;
    this.buildHelp();
  }

  show() {
    $('hud').classList.remove('hidden');
  }

  setRoom(code) {
    this.roomEl.replaceChildren(el('span', '', 'ROOM '), el('b', '', code));
  }

  // ---------------------------------------------------------------- viewports
  layout(rects, captions) {
    const key = JSON.stringify(rects) + captions.join(',');
    if (this._layoutKey === key) return;
    this._layoutKey = key;
    for (const vp of this.vps) vp.box.remove();
    this.vps = rects.map((r, i) => {
      const box = el('div', 'vp');
      box.style.left = r.x * 100 + '%';
      box.style.width = r.w * 100 + '%';
      box.style.top = (1 - r.y - r.h) * 100 + '%';
      box.style.height = r.h * 100 + '%';
      const labels = el('div', 'vp-labels');
      const fx = el('div', 'vp-fx');
      box.append(labels, fx);
      let caption = null;
      if (captions[i]) {
        caption = el('div', 'vp-caption', captions[i]);
        box.appendChild(caption);
      }
      this.views.appendChild(box);
      return { box, labels, fx, tags: new Map(), caption, w: 1, h: 1 };
    });
    for (const w of this.words) w.els = [];
  }

  // ---------------------------------------------------------------- POW words
  word(text, world, opts = {}) {
    if (!text) return;
    const o = {
      size: opts.size || 46,
      colors: opts.colors || BURST_COLORS[(Math.random() * BURST_COLORS.length) | 0],
      rot: opts.rot ?? Math.random() * 30 - 15,
      dur: opts.dur || 0.9,
      plain: !!opts.plain,
      pts: burstPoints(opts.spikes || 12),
    };
    this.words.push({
      text, opts: o, world: world ? world.clone() : null, sx: opts.sx, sy: opts.sy, screen: !world,
      ox: (Math.random() - 0.5) * 40 + (opts.ox || 0), oy: -30 - Math.random() * 30 + (opts.oy || 0),
      t: 0, max: o.dur + 0.05, els: [], only: opts.only ?? -1,
    });
    if (this.words.length > 30) this.removeWord(0);
  }

  removeWord(i) {
    for (const e of this.words[i].els) if (e) e.remove();
    this.words.splice(i, 1);
  }

  announce(text, sub, style) {
    this.announceEl.querySelectorAll('.ann').forEach((n) => {
      n.classList.add('out');
      setTimeout(() => n.remove(), 400);
    });
    const a = el('div', 'ann ' + (style || 'big'), text);
    if (sub) a.appendChild(el('span', 'sub', sub));
    this.announceEl.appendChild(a);
    const life = style === 'count' ? 800 : style === 'small' ? 2600 : style === 'champ' ? 5200 : style === 'level' ? 2600 : 2000;
    setTimeout(() => {
      a.classList.add('out');
      setTimeout(() => a.remove(), 400);
    }, life);
  }

  flash(v) {
    this.flashV = Math.max(this.flashV, v);
  }

  // ---------------------------------------------------------------- per-frame
  // views: [{ camera, rect }], ctx: { views(rascals), states, roster, localSlots }
  update(dt, views, W, H, ctx) {
    for (let vi = 0; vi < this.vps.length; vi++) {
      const r = views[vi] ? views[vi].rect : { w: 1, h: 1 };
      this.vps[vi].w = r.w * W;
      this.vps[vi].h = r.h * H;
    }
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      if (w.t > w.max) {
        this.removeWord(i);
        continue;
      }
      for (let vi = 0; vi < this.vps.length; vi++) {
        const vp = this.vps[vi];
        if (w.only >= 0 && w.only !== vi) continue;
        let x, y;
        if (w.screen) {
          if (vi > 0) continue;
          x = w.sx;
          y = w.sy;
        } else {
          if (!views[vi]) continue;
          _v.copy(w.world).project(views[vi].camera);
          if (_v.z > 1 || Math.abs(_v.x) > 1.3 || Math.abs(_v.y) > 1.3) {
            if (w.els[vi]) w.els[vi].style.display = 'none';
            continue;
          }
          x = (_v.x * 0.5 + 0.5) * vp.w;
          y = (-_v.y * 0.5 + 0.5) * vp.h;
        }
        let e = w.els[vi];
        if (!e) {
          const o = { ...w.opts, size: Math.round(w.opts.size * Math.min(1, Math.sqrt(vp.h / 700) + 0.15)) };
          e = w.els[vi] = makeWordEl(w.text, o);
          (w.screen ? this.views : vp.fx).appendChild(e);
        }
        e.style.display = '';
        const cx = Math.min(vp.w - 50, Math.max(50, x + w.ox));
        const cy = Math.min(vp.h - 50, Math.max(50, y + w.oy));
        e.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      }
    }
    if (this.flashV > 0) {
      this.flashV = Math.max(0, this.flashV - dt * 6);
      this.flashEl.style.opacity = this.flashV.toFixed(3);
    }
    for (let vi = 0; vi < this.vps.length; vi++) if (views[vi]) this.updateTags(vi, views[vi].camera, ctx);
  }

  updateTags(vi, camera, ctx) {
    const vp = this.vps[vi];
    const seen = new Set();
    for (const [id, view] of ctx.views) {
      const s = ctx.states.get(id);
      const r = ctx.roster.get(id);
      if (!s || !r || s.s === ST.DEAD) continue;
      view.headWorld(_v);
      _v.y += 0.85;
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      if (_v.z > 1 || dist > 45) continue;
      seen.add(id);
      let tag = vp.tags.get(id);
      if (!tag) {
        tag = el('div', 'nametag');
        tag._name = el('span', 'nm');
        tag._pn = el('span', 'pn');
        tag._zz = el('span', 'zz', 'Zzz');
        tag._bar = el('span', 'kobar');
        tag._barFill = el('i');
        tag._bar.appendChild(tag._barFill);
        tag._stam = el('span', 'stambar');
        tag._stamFill = el('i');
        tag._stam.appendChild(tag._stamFill);
        tag._arrow = el('span', 'arrow');
        tag.append(tag._zz, tag._bar, tag._stam, tag._pn, tag._name, tag._arrow);
        vp.labels.appendChild(tag);
        vp.tags.set(id, tag);
      }
      const local = ctx.localSlots.get(id);
      const pc = r.dummy ? '#9c7442' : hex(COLORS[r.color % COLORS.length].body);
      tag.style.setProperty('--pc', pc);
      const nameText = r.dummy ? 'TEST DUMMY' : r.name;
      if (tag._name.textContent !== nameText) tag._name.textContent = nameText;
      tag._name.className = r.dummy ? 'nm dum' : 'nm';
      const pnText = local ? local.label : '';
      if (tag._pn.textContent !== pnText) tag._pn.textContent = pnText;
      tag._pn.style.display = local ? '' : 'none';
      tag._arrow.style.display = local ? '' : 'none';
      const ko = s.ko > 0;
      tag._zz.style.display = ko ? '' : 'none';
      tag._bar.style.display = ko ? '' : 'none';
      if (ko) tag._barFill.style.width = Math.max(0, Math.min(100, (s.ko / 360) * 100)).toFixed(0) + '%';
      const climbing = s.s === ST.HANG || s.s === ST.CLIMB;
      tag._stam.style.display = climbing ? '' : 'none';
      if (climbing) {
        tag._stamFill.style.width = (s.sm ?? 100) + '%';
        tag._stam.classList.toggle('low', (s.sm ?? 100) < 30);
      }
      const x = (_v.x * 0.5 + 0.5) * vp.w, y = (-_v.y * 0.5 + 0.5) * vp.h;
      tag.style.display = '';
      const sc = Math.max(0.6, Math.min(1.15, 14 / Math.max(4, dist)));
      tag.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(2)})`;
    }
    for (const [id, tag] of vp.tags) {
      if (!seen.has(id)) {
        tag.style.display = 'none';
        if (!ctx.roster.has(id)) {
          tag.remove();
          vp.tags.delete(id);
        }
      }
    }
  }

  // ---------------------------------------------------------------- player cards
  updateCards(roster, states, localSlots, snap) {
    const phase = snap ? snap.ph : PHASE.LOBBY;
    const humans = [...roster.values()].filter((r) => !r.dummy);
    const seen = new Set();
    const props = snap ? new Map(snap.props.map((p) => [p.id, p])) : new Map();
    this.cards.classList.toggle('hidden', phase === PHASE.LOBBY && !snap?.practice);
    humans.forEach((r, i) => {
      seen.add(r.id);
      let c = this.cardEls.get(r.id);
      if (!c) {
        c = el('div', 'card');
        c._face = el('div', 'face');
        c._img = el('img');
        c._face.appendChild(c._img);
        c._name = el('div', 'name');
        c._dmg = el('div', 'dmg');
        c._bars = el('div', 'bars');
        c._daze = el('div', 'meter daze');
        c._dazeFill = el('i');
        c._daze.appendChild(c._dazeFill);
        c._guard = el('div', 'meter guard');
        c._guardFill = el('i');
        c._guard.appendChild(c._guardFill);
        c._super = el('div', 'meter super');
        c._superFill = el('i');
        c._super.appendChild(c._superFill);
        c._bars.append(c._daze, c._guard, c._super);
        c._meta = el('div', 'meta');
        c._stars = el('span', 'stars');
        c._kos = el('span', 'kos');
        c._meta.append(c._stars, c._kos);
        c._item = el('div', 'item');
        c._zz = el('div', 'kozz', 'K.O. Zzz');
        c._sup = el('div', 'supready', 'SUPER READY!');
        c.append(c._face, c._name, c._dmg, c._bars, c._meta, c._item, c._zz, c._sup);
        c.style.setProperty('--rot', (i % 2 ? 1.5 : -1.5) + 'deg');
        this.cards.appendChild(c);
        this.cardEls.set(r.id, c);
      }
      const col = COLORS[r.color % COLORS.length];
      c.style.setProperty('--pc', hex(col.body));
      const portrait = this.portraits && this.portraits[(r.char || 0) + ':' + (r.color % COLORS.length)];
      if (portrait && c._img.src !== portrait) c._img.src = portrait;
      const local = localSlots.get(r.id);
      c.classList.toggle('local', !!local);
      const nameKey = (local ? local.label + '|' : '') + r.name;
      if (c._nameKey !== nameKey) {
        c._nameKey = nameKey;
        c._name.replaceChildren();
        if (local) c._name.appendChild(el('span', 'tag', local.label));
        c._name.appendChild(document.createTextNode(r.name));
      }
      const s = states.get(r.id);
      const dmg = s ? s.d : 0;
      const dead = !s || s.s === ST.DEAD;
      c.classList.toggle('dead', dead && phase !== PHASE.LOBBY);
      c.classList.toggle('ko', !!(s && s.ko > 0));
      const dtxt = String(dmg);
      if (c._dmgKey !== dtxt) {
        c._dmgKey = dtxt;
        c._dmg.replaceChildren(document.createTextNode(dtxt), el('small', '', '%'));
        const prev = this.lastDamage.get(r.id) || 0;
        if (dmg > prev) {
          c._dmg.classList.remove('hit');
          void c._dmg.offsetWidth;
          c._dmg.classList.add('hit');
        }
        this.lastDamage.set(r.id, dmg);
        const heat = Math.min(1, dmg / 150);
        c._dmg.style.setProperty('--dc', heat < 0.33 ? '#ffffff' : heat < 0.66 ? '#ffd21f' : heat < 0.9 ? '#ff8a00' : '#ef2f2a');
      }
      c._dazeFill.style.width = (s && s.ko > 0 ? 100 : s ? s.dz : 0) + '%';
      c._daze.classList.toggle('full', !!s && (s.dz > 80 || s.ko > 0));
      c._guardFill.style.width = (s ? s.gd : 100) + '%';
      c._guard.classList.toggle('low', !!s && s.gd < 30);
      const su = s ? s.su || 0 : 0;
      c._superFill.style.width = su + '%';
      c._super.classList.toggle('full', su >= 100);
      c._sup.style.display = su >= 100 && !dead ? '' : 'none';
      const toWin = this.roundsToWin || 3;
      const stars = '★'.repeat(Math.min(r.wins, toWin)) + '☆'.repeat(Math.max(0, toWin - r.wins));
      if (c._stars.textContent !== stars) c._stars.textContent = stars;
      const kos = `KOs ${r.kos}`;
      if (c._kos.textContent !== kos) c._kos.textContent = kos;
      // held item / ammo
      let itemText = CHARACTERS[r.char || 0].name;
      if (s && s.h >= 0) {
        const pr = props.get(s.h);
        if (pr) {
          const def = ITEMS[pr.k];
          itemText = def.label + (pr.am !== undefined ? ` x${pr.am}` : '');
        }
      }
      if (c._item.textContent !== itemText) c._item.textContent = itemText;
      c._zz.style.display = s && s.ko > 0 ? '' : 'none';
    });
    for (const [id, c] of this.cardEls) {
      if (!seen.has(id)) {
        c.remove();
        this.cardEls.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- top bar / race bar / join prompts
  updatePhase(snap, roster) {
    if (!snap) return;
    let main = '', sub = '';
    const lv = LEVELS[snap.lv] || LEVELS[0];
    this.phaseEl.classList.toggle('sudden', !!snap.sd && snap.ph === PHASE.FIGHT);
    switch (snap.ph) {
      case PHASE.LOBBY:
        main = 'PRACTICE';
        sub = lv.name;
        break;
      case PHASE.COUNTDOWN:
        main = `ROUND ${snap.rd}`;
        sub = lv.name;
        break;
      case PHASE.FIGHT: {
        const secs = Math.floor(snap.pt / 60);
        const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
        main = snap.sd ? 'SUDDEN DEATH!' : `ROUND ${snap.rd}`;
        sub = lv.mode === 'race' ? `${mm}:${ss}  -  RUN!` : `${mm}:${ss}  -  ${lv.name}`;
        break;
      }
      case PHASE.ROUND_END:
        main = 'ROUND OVER!';
        sub = `First to ${this.roundsToWin || 3} wins`;
        break;
      case PHASE.MATCH_END:
        main = 'MATCH OVER!';
        sub = 'Back to the lobby soon';
        break;
    }
    const key = main + '|' + sub;
    if (this._phaseKey !== key) {
      this._phaseKey = key;
      this.phaseEl.replaceChildren(document.createTextNode(main), el('span', 'sub', sub));
    }
    // race progress bar
    const race = lv.mode === 'race';
    this.raceEl.classList.toggle('hidden', !race);
    if (race) {
      const x0 = -10, x1 = lv.finishX;
      const pct = (x) => Math.max(0, Math.min(100, ((x - x0) / (x1 - x0)) * 100));
      if (!this._raceDots) this._raceDots = new Map();
      if (!this._raceChaser) {
        this.raceEl.replaceChildren(el('div', 'race-track'), el('div', 'race-flag', '🏁'));
        this._raceChaser = el('div', 'race-chaser', 'ROLLER');
        this.raceEl.appendChild(this._raceChaser);
        this._raceDots.clear();
      }
      this._raceChaser.style.left = pct(snap.cx ?? lv.chaser.startX) + '%';
      const seen = new Set();
      for (const p of snap.players) {
        const r = roster.get(p.id);
        if (!r || r.dummy || p.s === ST.DEAD) continue;
        seen.add(p.id);
        let d = this._raceDots.get(p.id);
        if (!d) {
          d = el('div', 'race-dot');
          this.raceEl.appendChild(d);
          this._raceDots.set(p.id, d);
        }
        d.style.left = pct(p.x) + '%';
        d.style.background = hex(COLORS[r.color % COLORS.length].body);
      }
      for (const [id, d] of this._raceDots) if (!seen.has(id)) { d.remove(); this._raceDots.delete(id); }
    } else if (this._raceChaser) {
      this._raceChaser = null;
      this.raceEl.replaceChildren();
    }
  }

  updateJoin(prompts) {
    const key = prompts.join('|');
    if (this._joinKey === key) return;
    this._joinKey = key;
    this.joinbar.replaceChildren(
      ...prompts.map((p) => {
        const d = el('div', 'joinprompt');
        const [a, b, c] = p.split('*');
        d.append(document.createTextNode(a), el('b', '', b || ''), document.createTextNode(c || ''));
        return d;
      }),
    );
  }

  updateNet(rtt, connected) {
    const txt = connected ? `PING ${Math.round(rtt)}ms` : 'OFFLINE!';
    if (this._netKey !== txt) {
      this._netKey = txt;
      this.netEl.textContent = txt;
    }
  }

  toggleHelp(force) {
    const hide = force === undefined ? !this.helpEl.classList.contains('hidden') : !force;
    this.helpEl.classList.toggle('hidden', hide);
  }

  buildHelp() {
    const rows = (list) => {
      const t = el('table');
      for (const [k, v] of list) {
        const tr = el('tr');
        tr.append(el('td', '', k), el('td', '', v));
        t.appendChild(tr);
      }
      return t;
    };
    const pad = [
      ['Left Stick', 'Move (keep running to SPRINT)'],
      ['Right Stick', 'Turn your camera'],
      ['D-Pad up / down', 'Zoom camera in / out'],
      ['A', 'Jump  ·  climb up a ledge'],
      ['X', 'Punch / swing / shoot (hold = charge)'],
      ['Y', 'Kick  ·  air: DROPKICK  ·  sprint: SLIDE'],
      ['Sprint + X', 'SPEAR TACKLE'],
      ['LT / RT', 'Left / right hand grab (hold)'],
      ['LT + RT', 'Lift a rascal overhead'],
      ['Hold LT/RT on a wall', 'Cling & climb back up'],
      ['B', 'Dodge roll (puts out fire!)'],
      ['RB', 'Block  ·  air: GROUND POUND'],
      ['LB', 'Taunt  ·  SUPER when meter is full'],
      ['View', 'Help / lobby settings (host)'],
    ];
    const kb = [
      ['WASD', 'Move'],
      ['Mouse / Arrows', 'Turn camera (click to lock mouse)'],
      ['Wheel  - / =', 'Zoom camera'],
      ['Space', 'Jump'],
      ['J', 'Punch / swing / shoot'],
      ['K', 'Kick'],
      ['Q / E or mouse L / R', 'Left / right hand grab'],
      ['L', 'Block  ·  air: ground pound'],
      ['Shift', 'Dodge roll'],
      ['T', 'Taunt / SUPER'],
      ['Enter', 'Join / ready'],
      ['M', 'Music on / off'],
      ['H', 'This help'],
    ];
    const c1 = el('div');
    c1.append(el('h3', '', 'XBOX CONTROLLER'), rows(pad));
    const c2 = el('div');
    c2.append(el('h3', '', 'KEYBOARD + MOUSE'), rows(kb));
    const cols = el('div', 'cols');
    cols.append(c1, c2);
    const tip = el('div', 'tip', 'HOW TO WIN: Pound rascals until their daze bar fills and they get KNOCKED OUT. Grab them with one trigger to DRAG them, squeeze both to LIFT, then press X to chuck them off the stage! Knocked off? Hold a trigger against the wall to climb back. Block drains your guard meter (tap block right before a hit to PARRY). Fill your SUPER meter and press LB for SPIN-O-RAMA!');
    this.helpEl.replaceChildren(el('h2', '', 'HOW TO RUMBLE'), cols, tip);
  }
}
