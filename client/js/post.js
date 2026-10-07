// Comic-book post-processing: ink outlines (normal + depth edges), halftone shading,
// paper grain, speed lines and impact frames.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float uTime;
uniform float uFlash;
uniform float uSpeed;
uniform vec2 uSpeedCenter;
uniform float uImpact;
uniform float uLine;
uniform float uDot;
uniform float uSat;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 px = 1.0 / resolution;
  vec4 c0 = texture2D(tColor, vUv);
  // the scene is rendered linear; do the comic treatment in display (gamma) space
  vec3 col = pow(clamp(c0.rgb, 0.0, 1.0), vec3(1.0 / 2.2));

  // ---------------------------------------------------- ink outlines
  float th = uLine;
  vec4 n0 = texture2D(tNormal, vUv);
  float d0 = linDepth(vUv);
  float edge = 0.0;
  vec2 offs[8];
  offs[0] = vec2(th, 0.0); offs[1] = vec2(-th, 0.0); offs[2] = vec2(0.0, th); offs[3] = vec2(0.0, -th);
  offs[4] = vec2(th, th) * 0.7; offs[5] = vec2(-th, th) * 0.7; offs[6] = vec2(th, -th) * 0.7; offs[7] = vec2(-th, -th) * 0.7;
  for (int i = 0; i < 8; i++) {
    vec2 uv = vUv + offs[i] * px;
    vec4 n1 = texture2D(tNormal, uv);
    float d1 = linDepth(uv);
    // silhouette against background
    float sil = abs(n0.a - n1.a);
    // crease from normal change
    float nd = length(n0.rgb - n1.rgb) * min(n0.a, n1.a);
    // depth discontinuity (relative, so distant objects keep thin lines)
    float dd = abs(d0 - d1) / min(d0, d1);
    edge = max(edge, sil);
    edge = max(edge, smoothstep(0.35, 0.6, nd));
    edge = max(edge, smoothstep(0.035, 0.07, dd) * min(n0.a, n1.a));
  }
  // thinner lines far away
  float far = smoothstep(60.0, 160.0, d0);
  edge *= 1.0 - far * 0.6;

  // ---------------------------------------------------- halftone shading
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float cell = uDot;
  mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 hp = rot * gl_FragCoord.xy / cell;
  vec2 cp = fract(hp) - 0.5;
  float shade = clamp((0.62 - lum) * 1.7, 0.0, 1.0);
  float r = sqrt(shade) * 0.62;
  float dotMask = 1.0 - smoothstep(r - 0.07, r + 0.07, length(cp));
  col = mix(col, col * vec3(0.42, 0.38, 0.55), dotMask * 0.75 * step(0.001, shade));
  // bright highlight dots (subtle Ben-Day pop)
  float hi = clamp((lum - 0.82) * 4.0, 0.0, 1.0);
  float hr = sqrt(hi) * 0.35;
  float hiMask = 1.0 - smoothstep(hr - 0.06, hr + 0.06, length(cp));
  col = mix(col, vec3(1.0), hiMask * 0.35);

  // saturation punch
  float g = dot(col, vec3(0.333));
  col = mix(vec3(g), col, uSat);

  // ink
  vec3 ink = vec3(0.08, 0.06, 0.12);
  col = mix(col, ink, clamp(edge, 0.0, 1.0));

  // paper grain + vignette
  float grain = hash(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;
  col += grain * 0.035;
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.45;

  // ---------------------------------------------------- speed lines (big hits)
  if (uSpeed > 0.001) {
    vec2 dv = (vUv - uSpeedCenter) * vec2(resolution.x / resolution.y, 1.0);
    float ang = atan(dv.y, dv.x);
    float rad = length(dv);
    float lines = step(0.72, hash(vec2(floor(ang * 70.0), floor(uTime * 24.0))));
    float mask = smoothstep(0.18, 0.75, rad) * lines * uSpeed;
    col = mix(col, vec3(1.0), mask * 0.85);
  }

  // impact frame: high contrast inverted black & white
  if (uImpact > 0.001) {
    float l2 = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 bw = vec3(step(0.5, l2 + edge * -1.0));
    bw = 1.0 - bw;
    bw = mix(bw, vec3(1.0, 0.95, 0.4) * (1.0 - step(0.5, l2)), 0.25);
    col = mix(col, bw, uImpact);
  }

  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class ComicPost {
  constructor(renderer) {
    this.renderer = renderer;
    this.normalMat = new THREE.MeshNormalMaterial();
    this.size = new THREE.Vector2(1, 1);
    this.makeTargets(1, 1);
    this.uniforms = {
      tColor: { value: this.colorRT.texture },
      tNormal: { value: this.normalRT.texture },
      tDepth: { value: this.normalRT.depthTexture },
      resolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.5 },
      cameraFar: { value: 600 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uSpeed: { value: 0 },
      uSpeedCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uImpact: { value: 0 },
      uLine: { value: 1.5 },
      uDot: { value: 6 },
      uSat: { value: 1.12 },
    };
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.clearColor = new THREE.Color();
  }

  makeTargets(w, h) {
    if (this.normalRT) {
      this.normalRT.dispose();
      this.colorRT.dispose();
    }
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    this.normalRT = new THREE.WebGLRenderTarget(w, h, {
      depthTexture,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const ext = this.renderer.extensions;
    const halfOk = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.colorRT = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType });
    this.colorRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    if (this.uniforms) {
      this.uniforms.tColor.value = this.colorRT.texture;
      this.uniforms.tNormal.value = this.normalRT.texture;
      this.uniforms.tDepth.value = this.normalRT.depthTexture;
    }
  }

  setSize(w, h, pixelRatio) {
    const W = Math.floor(w * pixelRatio), H = Math.floor(h * pixelRatio);
    if (W === this.size.x && H === this.size.y) return;
    this.size.set(W, H);
    this.makeTargets(W, H);
    this.uniforms.resolution.value.set(W, H);
    this.uniforms.uLine.value = Math.max(1.0, H / 620);
    this.uniforms.uDot.value = Math.max(4, Math.round(H / 170));
  }

  // views: [{ camera, rect: {x,y,w,h} normalized (bottom-left origin) }]
  render(scene, views, time) {
    const r = this.renderer;
    const cam0 = views[0].camera;
    this.uniforms.uTime.value = time;
    this.uniforms.cameraNear.value = cam0.near;
    this.uniforms.cameraFar.value = cam0.far;
    r.getClearColor(this.clearColor);
    const clearAlpha = r.getClearAlpha();
    const W = this.size.x, H = this.size.y;
    const gutter = views.length > 1 ? Math.max(3, Math.round(H / 220)) : 0;
    const rects = views.map((v) => {
      const x = Math.round(v.rect.x * W), y = Math.round(v.rect.y * H);
      const w = Math.round(v.rect.w * W), h = Math.round(v.rect.h * H);
      return [x + gutter, y + gutter, Math.max(1, w - gutter * 2), Math.max(1, h - gutter * 2)];
    });
    const setRect = (rt, rc) => {
      rt.viewport.set(rc[0], rc[1], rc[2], rc[3]);
      rt.scissor.set(rc[0], rc[1], rc[2], rc[3]);
      rt.scissorTest = true;
    };

    // 1) normals + depth (outlined geometry only: layer 0)
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    r.shadowMap.autoUpdate = false;
    this.normalRT.scissorTest = false;
    this.normalRT.viewport.set(0, 0, W, H);
    r.setRenderTarget(this.normalRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    views.forEach((v, i) => {
      v.camera.layers.set(0);
      setRect(this.normalRT, rects[i]);
      r.setRenderTarget(this.normalRT);
      if (this.onView) this.onView(v.camera, i);
      r.render(scene, v.camera);
      v.camera.layers.enableAll();
    });
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;

    // 2) color
    r.shadowMap.needsUpdate = true;
    this.colorRT.scissorTest = false;
    this.colorRT.viewport.set(0, 0, W, H);
    r.setRenderTarget(this.colorRT);
    r.setClearColor(0x15101e, 1);
    r.clear();
    r.setClearColor(this.clearColor, clearAlpha);
    views.forEach((v, i) => {
      setRect(this.colorRT, rects[i]);
      r.setRenderTarget(this.colorRT);
      if (this.onView) this.onView(v.camera, i);
      r.render(scene, v.camera);
    });
    this.colorRT.scissorTest = false;
    this.normalRT.scissorTest = false;

    // 3) composite
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
