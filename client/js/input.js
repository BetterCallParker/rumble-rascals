// Keyboard/mouse + Xbox (standard-mapping) gamepad input. Each physical device is a "slot".
import { BTN, quantizeAxis } from '/shared/constants.js';

const DEADZONE = 0.18;
const TRIGGER = 0.3;

// Standard gamepad mapping (Xbox layout)
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const KEY_BINDS = {
  Space: BTN.JUMP,
  KeyJ: BTN.ATTACK,
  KeyK: BTN.KICK,
  KeyQ: BTN.GRAB_L,
  KeyE: BTN.GRAB_R,
  KeyL: BTN.BLOCK,
  KeyI: BTN.BLOCK,
  ShiftLeft: BTN.DODGE,
  ShiftRight: BTN.DODGE,
  KeyT: BTN.TAUNT,
  Enter: BTN.START,
};
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1']);

function radial(x, y) {
  const l = Math.hypot(x, y);
  if (l < DEADZONE) return [0, 0];
  const s = Math.min(1, (l - DEADZONE) / (1 - DEADZONE)) / l;
  return [x * s, y * s];
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.listeners = [];
    this.canvas = document.getElementById('game');
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      this.emitActivity();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = 0; });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouse |= e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
      if (this.wantPointerLock && document.pointerLockElement !== this.canvas) {
        try { this.canvas.requestPointerLock(); } catch { /* not allowed */ }
      }
      this.emitActivity();
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(e.button === 0 ? 1 : e.button === 2 ? 2 : 0); });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.prevPadButtons = new Map();
    this.padPressed = new Map();
    this.prevStick = new Map();
    this.wantPointerLock = false;
  }

  onActivity(fn) { this.listeners.push(fn); }
  emitActivity() { for (const fn of this.listeners) fn(); }

  // Call once per animation frame before reading
  poll() {
    this.padPressed.clear();
    for (const gp of this.pads()) {
      let raw = 0;
      gp.buttons.forEach((b, i) => {
        if (b && (b.pressed || b.value > TRIGGER)) raw |= 1 << i;
      });
      // stick flicks count as d-pad presses for menus
      const [sx, sy] = radial(gp.axes[0] || 0, gp.axes[1] || 0);
      const prev = this.prevStick.get(gp.index) || [0, 0];
      let flick = 0;
      if (sx > 0.6 && prev[0] <= 0.6) flick |= 1 << 20;
      if (sx < -0.6 && prev[0] >= -0.6) flick |= 1 << 21;
      if (sy > 0.6 && prev[1] <= 0.6) flick |= 1 << 22;
      if (sy < -0.6 && prev[1] >= -0.6) flick |= 1 << 23;
      this.prevStick.set(gp.index, [sx, sy]);
      const prevB = this.prevPadButtons.get(gp.index) || 0;
      const pressed = (raw & ~prevB) | flick;
      this.padPressed.set(gp.index, pressed);
      this.prevPadButtons.set(gp.index, raw);
      if (raw & ~prevB) this.emitActivity();
    }
  }

  endFrame() {
    this.pressedKeys.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  pads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const out = [];
    for (const gp of list) if (gp && gp.connected) out.push(gp);
    return out;
  }

  pad(slot) {
    if (!slot || slot === 'kb') return null;
    return (navigator.getGamepads ? navigator.getGamepads() : [])[Number(slot.slice(3))] || null;
  }

  padJustPressed(index, button) {
    return ((this.padPressed.get(index) || 0) & (1 << button)) !== 0;
  }

  keyJustPressed(code) {
    return this.pressedKeys.has(code);
  }

  // Game input for a slot: raw stick (camera relative, converted later) + buttons
  read(slot) {
    if (slot === 'kb') return this.readKeyboard();
    const gp = this.pad(slot);
    if (!gp) return { mx: 0, mz: 0, b: 0 };
    const [mx, mz] = radial(gp.axes[0] || 0, gp.axes[1] || 0);
    const btn = (i) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > TRIGGER);
    let b = 0;
    if (btn(PAD.A)) b |= BTN.JUMP;
    if (btn(PAD.X)) b |= BTN.ATTACK;
    if (btn(PAD.Y)) b |= BTN.KICK;
    if (btn(PAD.B)) b |= BTN.DODGE;
    if (btn(PAD.RB)) b |= BTN.BLOCK;
    if (btn(PAD.LB)) b |= BTN.TAUNT;
    if (btn(PAD.LT)) b |= BTN.GRAB_L;
    if (btn(PAD.RT)) b |= BTN.GRAB_R;
    if (btn(PAD.MENU)) b |= BTN.START;
    return { mx: quantizeAxis(mx), mz: quantizeAxis(mz), b };
  }

  readKeyboard() {
    const k = (c) => this.keys.has(c);
    let mx = 0, mz = 0;
    if (k('KeyA')) mx -= 1;
    if (k('KeyD')) mx += 1;
    if (k('KeyW')) mz -= 1;
    if (k('KeyS')) mz += 1;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let b = 0;
    for (const code in KEY_BINDS) if (this.keys.has(code)) b |= KEY_BINDS[code];
    if (this.mouse & 1) b |= BTN.GRAB_L;
    if (this.mouse & 2) b |= BTN.GRAB_R;
    return { mx: quantizeAxis(mx), mz: quantizeAxis(mz), b };
  }

  // Camera control for a slot: { yaw, pitch } deltas (radians) and zoom factor
  look(slot, dt) {
    if (slot === 'kb') {
      const k = (c) => this.keys.has(c);
      let yaw = (this.mouseDX || 0) * 0.0045, pitch = (this.mouseDY || 0) * 0.0035;
      if (k('ArrowLeft')) yaw -= 2.4 * dt;
      if (k('ArrowRight')) yaw += 2.4 * dt;
      if (k('ArrowUp')) pitch -= 1.5 * dt;
      if (k('ArrowDown')) pitch += 1.5 * dt;
      let zoom = 0;
      if (k('Equal') || k('NumpadAdd')) zoom -= 1.5 * dt;
      if (k('Minus') || k('NumpadSubtract')) zoom += 1.5 * dt;
      zoom += this.wheel * 0.12;
      return { yaw, pitch, zoom, active: !!(yaw || pitch) };
    }
    const gp = this.pad(slot);
    if (!gp) return { yaw: 0, pitch: 0, zoom: 0, active: false };
    const [rx, ry] = radial(gp.axes[2] || 0, gp.axes[3] || 0);
    const btn = (i) => !!gp.buttons[i] && gp.buttons[i].pressed;
    let zoom = 0;
    if (btn(PAD.UP)) zoom -= 1.4 * dt;
    if (btn(PAD.DOWN)) zoom += 1.4 * dt;
    // ease-in curve for precise aiming
    const curve = (v) => Math.sign(v) * v * v;
    return { yaw: curve(rx) * 3.0 * dt, pitch: curve(ry) * 1.8 * dt, zoom, active: Math.abs(rx) + Math.abs(ry) > 0.05 };
  }

  // Edge-triggered menu actions for a slot this frame
  menu(slot) {
    const m = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, view: false, hatPrev: false, hatNext: false, face: false, color: false, practice: false };
    if (slot === 'kb') {
      const p = (c) => this.pressedKeys.has(c);
      m.up = p('KeyW') || p('ArrowUp');
      m.down = p('KeyS') || p('ArrowDown');
      m.left = p('KeyA') || p('ArrowLeft');
      m.right = p('KeyD') || p('ArrowRight');
      m.confirm = p('Space') || p('KeyJ');
      m.back = p('Escape') || p('Backspace');
      m.start = p('Enter');
      m.view = p('KeyN');
      m.hatPrev = p('KeyZ');
      m.hatNext = p('KeyX');
      m.face = p('KeyC');
      m.color = p('KeyV');
      m.practice = p('KeyP');
      return m;
    }
    const gp = this.pad(slot);
    if (!gp) return m;
    const pr = this.padPressed.get(gp.index) || 0;
    const bit = (i) => (pr & (1 << i)) !== 0;
    m.up = bit(PAD.UP) || bit(23);
    m.down = bit(PAD.DOWN) || bit(22);
    m.left = bit(PAD.LEFT) || bit(21);
    m.right = bit(PAD.RIGHT) || bit(20);
    m.confirm = bit(PAD.A);
    m.back = bit(PAD.B);
    m.start = bit(PAD.MENU);
    m.view = bit(PAD.VIEW);
    m.hatPrev = bit(PAD.LB);
    m.hatNext = bit(PAD.RB);
    m.face = bit(PAD.LS);
    m.color = bit(PAD.RS);
    m.practice = bit(PAD.Y);
    return m;
  }

  rumble(slot, strong, weak, ms) {
    const gp = this.pad(slot);
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', {
      startDelay: 0,
      duration: ms,
      strongMagnitude: Math.min(1, strong),
      weakMagnitude: Math.min(1, weak),
    }).catch(() => {});
  }
}
