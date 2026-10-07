// Toon materials and procedurally painted comic textures.
import * as THREE from 'three';

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  // 3 hard light bands = classic cel shading
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
  }
  return t;
}

const INK = '#15101e';

// ------------------------------------------------------------------ faces
const faceCache = new Map();
function cached(key, fn) {
  if (!faceCache.has(key)) faceCache.set(key, fn());
  return faceCache.get(key);
}

function eyeBase(g, w) {
  g.clearRect(0, 0, w, w);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(w / 2, w / 2, w / 2 - 9, 0, Math.PI * 2);
  g.fill();
}

export function eyeTexture(kind) {
  return cached('eye:' + kind, () =>
    canvasTex(128, 128, (g, w) => {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      switch (kind) {
        case 'open':
        case 'wide': {
          eyeBase(g, w);
          const r = kind === 'wide' ? 15 : 24;
          g.fillStyle = INK;
          g.beginPath();
          g.arc(w / 2 + 6, w / 2 + 4, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(w / 2 + 14, w / 2 - 6, r * 0.32, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'angry': {
          eyeBase(g, w);
          g.fillStyle = INK;
          g.beginPath();
          g.arc(w / 2 + 4, w / 2 + 10, 22, 0, Math.PI * 2);
          g.fill();
          // heavy lid
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(w, 0);
          g.lineTo(w, 30);
          g.lineTo(0, 58);
          g.closePath();
          g.fill();
          break;
        }
        case 'hurt': {
          g.strokeStyle = INK;
          g.lineWidth = 16;
          g.beginPath();
          g.moveTo(26, 26);
          g.lineTo(100, 64);
          g.lineTo(26, 102);
          g.stroke();
          break;
        }
        case 'x': {
          g.strokeStyle = INK;
          g.lineWidth = 18;
          g.beginPath();
          g.moveTo(24, 24);
          g.lineTo(104, 104);
          g.moveTo(104, 24);
          g.lineTo(24, 104);
          g.stroke();
          break;
        }
        case 'spiral': {
          eyeBase(g, w);
          g.strokeStyle = INK;
          g.lineWidth = 7;
          g.beginPath();
          for (let a = 0; a < Math.PI * 7; a += 0.1) {
            const r = 3 + a * 2.2;
            const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r;
            a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
          break;
        }
        case 'happy': {
          g.strokeStyle = INK;
          g.lineWidth = 16;
          g.beginPath();
          g.arc(w / 2, w / 2 + 22, 38, Math.PI * 1.12, Math.PI * 1.88);
          g.stroke();
          break;
        }
        case 'squint': {
          g.strokeStyle = INK;
          g.lineWidth = 15;
          g.beginPath();
          g.moveTo(20, 60);
          g.lineTo(108, 68);
          g.stroke();
          break;
        }
        case 'button': {
          g.fillStyle = '#2a1d14';
          g.beginPath();
          g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#5b4330';
          g.lineWidth = 6;
          g.beginPath();
          g.arc(w / 2, w / 2, w / 2 - 18, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#c9a36b';
          for (const [x, y] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
            g.beginPath();
            g.arc(w / 2 + x, w / 2 + y, 6, 0, Math.PI * 2);
            g.fill();
          }
          break;
        }
      }
    }),
  );
}

export function mouthTexture(kind) {
  return cached('mouth:' + kind, () =>
    canvasTex(192, 128, (g, w, h) => {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = INK;
      g.fillStyle = INK;
      const cx = w / 2, cy = h / 2;
      const openMouth = (rx, ry, teeth, tongue) => {
        g.fillStyle = '#3a0d12';
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.clip();
        if (tongue) {
          g.fillStyle = '#ff6f8a';
          g.beginPath();
          g.ellipse(cx + 8, cy + ry * 0.75, rx * 0.6, ry * 0.55, 0, 0, Math.PI * 2);
          g.fill();
        }
        if (teeth) {
          g.fillStyle = '#fff';
          g.fillRect(cx - rx, cy - ry, rx * 2, ry * 0.42);
        }
        g.restore();
        g.lineWidth = 9;
        g.strokeStyle = INK;
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        g.stroke();
      };
      switch (kind) {
        case 'grin': {
          g.lineWidth = 11;
          g.beginPath();
          g.moveTo(cx - 60, cy - 14);
          g.quadraticCurveTo(cx, cy + 36, cx + 60, cy - 20);
          g.stroke();
          g.lineWidth = 8;
          g.beginPath();
          g.moveTo(cx + 54, cy - 30);
          g.lineTo(cx + 66, cy - 12);
          g.stroke();
          break;
        }
        case 'shout':
          openMouth(62, 42, true, true);
          break;
        case 'ouch':
          openMouth(38, 46, false, true);
          break;
        case 'scream':
          openMouth(46, 54, true, true);
          break;
        case 'laugh': {
          g.fillStyle = '#3a0d12';
          g.beginPath();
          g.moveTo(cx - 62, cy - 22);
          g.quadraticCurveTo(cx, cy + 80, cx + 62, cy - 22);
          g.closePath();
          g.fill();
          g.fillStyle = '#ff6f8a';
          g.beginPath();
          g.ellipse(cx, cy + 22, 26, 16, 0, 0, Math.PI * 2);
          g.fill();
          g.lineWidth = 9;
          g.beginPath();
          g.moveTo(cx - 62, cy - 22);
          g.quadraticCurveTo(cx, cy + 80, cx + 62, cy - 22);
          g.closePath();
          g.stroke();
          break;
        }
        case 'grit': {
          g.fillStyle = '#fff';
          g.beginPath();
          g.roundRect(cx - 58, cy - 22, 116, 44, 14);
          g.fill();
          g.lineWidth = 8;
          g.stroke();
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(cx - 58, cy);
          g.lineTo(cx + 58, cy);
          for (let i = -2; i <= 2; i++) {
            g.moveTo(cx + i * 22, cy - 22);
            g.lineTo(cx + i * 22, cy + 22);
          }
          g.stroke();
          break;
        }
        case 'tongue': {
          g.lineWidth = 10;
          g.beginPath();
          g.moveTo(cx - 50, cy - 6);
          g.quadraticCurveTo(cx, cy + 10, cx + 50, cy - 10);
          g.stroke();
          g.fillStyle = '#ff6f8a';
          g.beginPath();
          g.ellipse(cx + 16, cy + 26, 20, 26, 0.2, 0, Math.PI * 2);
          g.fill();
          g.lineWidth = 7;
          g.stroke();
          break;
        }
        case 'wobble': {
          g.lineWidth = 10;
          g.beginPath();
          for (let x = -58; x <= 58; x += 4) {
            const y = Math.sin(x * 0.14) * 10;
            x === -58 ? g.moveTo(cx + x, cy + y) : g.lineTo(cx + x, cy + y);
          }
          g.stroke();
          break;
        }
        case 'stitch': {
          g.strokeStyle = '#3b2716';
          g.lineWidth = 8;
          g.beginPath();
          g.moveTo(cx - 58, cy);
          g.quadraticCurveTo(cx, cy + 14, cx + 58, cy);
          g.stroke();
          g.lineWidth = 6;
          for (let i = -4; i <= 4; i++) {
            const x = cx + i * 13;
            g.beginPath();
            g.moveTo(x - 4, cy - 12);
            g.lineTo(x + 4, cy + 18);
            g.stroke();
          }
          break;
        }
      }
    }),
  );
}

// ------------------------------------------------------------------ surfaces
// Calm sandy rooftop tiles so the rascals pop against the floor
export function floorTexture(base = '#e6d6b4', line = 'rgba(110,85,55,0.28)') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, 0, w / 2, h / 2);
    g.fillRect(w / 2, h / 2, w / 2, h / 2);
    g.fillStyle = 'rgba(90,60,30,0.08)';
    for (let i = 0; i < 220; i++) {
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, Math.random() * 2.2, 0, 7);
      g.fill();
    }
    g.strokeStyle = line;
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w / 2 - 3, h / 2 - 3);
    g.strokeRect(w / 2 + 1.5, 1.5, w / 2 - 3, h / 2 - 3);
    g.strokeRect(1.5, h / 2 + 1.5, w / 2 - 3, h / 2 - 3);
    g.strokeRect(w / 2 + 1.5, h / 2 + 1.5, w / 2 - 3, h / 2 - 3);
  }, { repeat: true });
}

// Big painted arena circle for the middle of the roof
export function emblemTexture() {
  return canvasTex(512, 512, (g, w) => {
    g.clearRect(0, 0, w, w);
    const c = w / 2;
    g.lineWidth = 26;
    g.strokeStyle = 'rgba(239,47,42,0.55)';
    g.beginPath();
    g.arc(c, c, c - 20, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(47,108,240,0.45)';
    g.beginPath();
    g.arc(c, c, c - 58, 0, Math.PI * 2);
    g.stroke();
    g.font = 'bold 120px Bangers, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(239,47,42,0.42)';
    g.fillText('RUMBLE', c, c + 42);
  });
}

export function concreteTexture(tint = '#b9a7c9') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    for (let y = 0; y < h; y += 32) {
      for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) g.fillRect(x, y, 62, 30);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }, { repeat: true });
}

export function hazardTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ffd21f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    for (let i = -2; i < 10; i++) {
      g.beginPath();
      g.moveTo(i * 40, h);
      g.lineTo(i * 40 + 20, h);
      g.lineTo(i * 40 + 20 + h, 0);
      g.lineTo(i * 40 + h, 0);
      g.closePath();
      g.fill();
    }
  }, { repeat: true });
}

export function crateTexture(base = '#c98b45', brace = '#8a5524') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,35,10,0.55)';
    g.lineWidth = 4;
    for (let y = 0; y < h; y += 42) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.fillStyle = brace;
    g.fillRect(0, 0, w, 30);
    g.fillRect(0, h - 30, w, 30);
    g.fillRect(0, 0, 30, h);
    g.fillRect(w - 30, 0, 30, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);
    g.fillRect(-170, -16, 340, 32);
    g.rotate(-Math.PI / 2);
    g.fillRect(-170, -16, 340, 32);
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
}

export function yellowCrateTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffc61a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);
    g.fillRect(-150, -18, 300, 36);
    g.rotate(-Math.PI / 2);
    g.fillRect(-150, -18, 300, 36);
    g.restore();
    g.fillStyle = '#e09a00';
    g.fillRect(0, 0, w, 22);
    g.fillRect(0, h - 22, w, 22);
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
}

export function plankTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b77a3e';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = x % 64 ? '#a96d33' : '#c2884a';
      g.fillRect(x, 0, 30, h);
      g.fillStyle = 'rgba(40,20,0,0.5)';
      g.fillRect(x + 30, 0, 2, h);
    }
    g.fillStyle = 'rgba(40,20,0,0.35)';
    for (let i = 0; i < 18; i++) g.fillRect(((Math.random() * 8) | 0) * 32 + 12, Math.random() * h, 6, 6);
  }, { repeat: true });
}

export function scaffoldTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4d3b6e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffb81f';
    g.lineWidth = 16;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(w - 8, h - 8);
    g.moveTo(w - 8, 8);
    g.lineTo(8, h - 8);
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: true });
}

export function containerTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#2f6cf0';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 24) {
      g.fillStyle = 'rgba(0,0,40,0.28)';
      g.fillRect(x, 0, 8, h);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 10, 0, 4, h);
    }
    g.font = 'bold 74px Bangers, Impact, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 10;
    g.strokeStyle = INK;
    g.strokeText('RUMBLE CO.', w / 2, h / 2 + 26);
    g.fillStyle = '#fff';
    g.fillText('RUMBLE CO.', w / 2, h / 2 + 26);
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
  });
}

export function windowsTexture(base, lit = '#ffe9a0', dark = '#2b2550') {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 6; y += 22) {
      for (let x = 10; x < w - 6; x += 22) {
        g.fillStyle = Math.random() < 0.3 ? lit : dark;
        g.fillRect(x, y, 13, 14);
      }
    }
  }, { repeat: true });
}

export function burlapTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#cfa96e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 4) {
      g.fillStyle = i % 8 ? 'rgba(120,80,30,0.18)' : 'rgba(255,240,200,0.18)';
      g.fillRect(i, 0, 2, h);
      g.fillRect(0, i, w, 2);
    }
  }, { repeat: true });
}

export function targetTexture() {
  return canvasTex(128, 128, (g, w) => {
    const rings = ['#ef2f2a', '#fff', '#ef2f2a', '#fff', '#ef2f2a'];
    rings.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2 - 2 - i * 12, 0, Math.PI * 2);
      g.fill();
    });
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2);
    g.stroke();
  });
}

export function starDecalTexture(bg = '#e8322c') {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    drawStar(g, w / 2, h * 0.62, 40, 18);
    g.fillStyle = '#20161a';
    g.fillRect(0, 0, w, 50);
  });
}

export function drawStar(g, x, y, r1, r2, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

export function stopSignTexture() {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#d81e1e';
    g.fillRect(0, 0, w, w);
    g.font = 'bold 92px Bangers, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText('STOP', w / 2, w / 2 + 32);
  });
}

export function barrelTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e8322c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a3150f';
    g.fillRect(0, 14, w, 8);
    g.fillRect(0, h - 22, w, 8);
    // little white crown like the comic art
    g.fillStyle = '#fff';
    for (const cx of [w * 0.25, w * 0.75]) {
      g.beginPath();
      g.moveTo(cx - 22, 82);
      g.lineTo(cx - 24, 46);
      g.lineTo(cx - 10, 62);
      g.lineTo(cx, 40);
      g.lineTo(cx + 10, 62);
      g.lineTo(cx + 24, 46);
      g.lineTo(cx + 22, 82);
      g.closePath();
      g.fill();
    }
  });
}

export function fenceTexture() {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#3d3a4a';
    g.lineWidth = 5;
    for (let i = -w; i < w * 2; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.moveTo(i + h, 0);
      g.lineTo(i, h);
      g.stroke();
    }
  }, { repeat: true });
  return t;
}

export function billboardTexture(text, sub, bg, fg) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < w; x += 12) {
      g.beginPath();
      g.arc(x, y, 3, 0, 7);
      g.fill();
    }
    g.textAlign = 'center';
    g.font = 'bold 120px Bangers, Impact, sans-serif';
    g.lineWidth = 14;
    g.strokeStyle = INK;
    g.strokeText(text, w / 2, h / 2 + 30);
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + 30);
    g.font = 'bold 44px Bangers, Impact, sans-serif';
    g.lineWidth = 8;
    g.strokeText(sub, w / 2, h - 24);
    g.fillStyle = '#fff';
    g.fillText(sub, w / 2, h - 24);
    g.lineWidth = 12;
    g.strokeRect(6, 6, w - 12, h - 12);
  });
}

export function skyTexture() {
  return canvasTex(64, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2a7bf0');
    grd.addColorStop(0.42, '#7cc4ff');
    grd.addColorStop(0.62, '#ffe7b8');
    grd.addColorStop(1, '#ff9e6b');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

export function labelTexture(text, color = '#fff', bg = null) {
  return canvasTex(256, 128, (g, w, h) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    g.font = 'bold 96px Bangers, Impact, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 12;
    g.strokeStyle = INK;
    g.strokeText(text, w / 2, h / 2 + 34);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 34);
  });
}

// Flat star shape for FX / dizzy stars
export function starShape(r1 = 0.5, r2 = 0.22, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

// Jagged comic burst shape
export function burstShape(r1 = 1, r2 = 0.55, n = 12, jitter = 0.25) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const r = (i % 2 ? r2 : r1) * (1 - jitter / 2 + Math.random() * jitter);
    const a = (i * Math.PI) / n;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
