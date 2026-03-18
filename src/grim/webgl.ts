// WebGL2 context wrapper — replaces grim/raylib_api.py
// Provides: textured quad batching, blend modes, render-to-texture, immediate-mode quads

export enum BlendMode {
  ALPHA,
  ADDITIVE,
  MULTIPLY,
  CUSTOM,
  NONE,
}

// Shader sources
const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aColor;
uniform mat4 uMVP;
out vec2 vUV;
out vec4 vColor;
void main() {
  vUV = aUV;
  vColor = aColor;
  gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUV) * vColor;
}`;

const ALPHA_TEST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 texel = texture(uTex, vUV) * vColor;
  if (texel.a <= 0.0156862745) discard;
  fragColor = texel;
}`;

const COLOR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColor;
uniform mat4 uMVP;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
}`;

const COLOR_FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() {
  fragColor = vColor;
}`;

export interface GlTexture {
  id: WebGLTexture;
  width: number;
  height: number;
}

export interface RenderTarget {
  id: WebGLFramebuffer;
  texture: GlTexture;
  width: number;
  height: number;
}

// Per-vertex: 2 pos + 2 uv + 4 color = 8 floats = 32 bytes
const FLOATS_PER_VERTEX = 8;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;
const MAX_QUADS = 8192;
const MAX_VERTICES = MAX_QUADS * 4;
const MAX_INDICES = MAX_QUADS * 6;

// Color-only vertex: 2 pos + 4 color = 6 floats = 24 bytes
const COLOR_FLOATS_PER_VERTEX = 6;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }
  return program;
}

function createShaderProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = linkProgram(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function orthoMatrix(left: number, right: number, bottom: number, top: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 2.0 / (right - left);
  m[5] = 2.0 / (top - bottom);
  m[10] = -1.0;
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[15] = 1.0;
  return m;
}

export class WebGLContext {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;

  // Shaders
  private _spriteProgram!: WebGLProgram;
  private _spriteAlphaTestProgram!: WebGLProgram;
  private _colorProgram!: WebGLProgram;
  private _spriteMvpLoc!: WebGLUniformLocation;
  private _spriteTexLoc!: WebGLUniformLocation;
  private _spriteAtMvpLoc!: WebGLUniformLocation;
  private _spriteAtTexLoc!: WebGLUniformLocation;
  private _colorMvpLoc!: WebGLUniformLocation;

  // Batching
  private _vao!: WebGLVertexArrayObject;
  private _vbo!: WebGLBuffer;
  private _ebo!: WebGLBuffer;
  private _vertexData: Float32Array;
  private _quadCount = 0;
  private _currentTexture: WebGLTexture | null = null;
  private _currentBlend: BlendMode = BlendMode.ALPHA;
  private _useAlphaTest = false;

  // Color-only batching
  private _colorVao!: WebGLVertexArrayObject;
  private _colorVbo!: WebGLBuffer;
  private _colorEbo!: WebGLBuffer;
  private _colorVertexData: Float32Array;
  private _colorQuadCount = 0;

  // Immediate-mode quad building
  private _immVao!: WebGLVertexArrayObject;
  private _immVbo!: WebGLBuffer;
  private _immEbo!: WebGLBuffer;
  private _immVertexData: Float32Array;
  private _immVertexCount = 0;
  private _immActive = false;
  private _immTexCoord: [number, number] = [0, 0];
  private _immColor: [number, number, number, number] = [1, 1, 1, 1];

  // Viewport state
  private _screenWidth = 0;
  private _screenHeight = 0;
  private _mvp!: Float32Array;

  // Render target stack
  private _rtStack: (RenderTarget | null)[] = [];
  private _currentRT: RenderTarget | null = null;

  // Custom blend
  private _customSrcFactor: number;
  private _customDstFactor: number;
  private _customBlendEq: number;
  private _customSrcAlpha: number = 0;
  private _customDstAlpha: number = 0;
  private _customBlendEqAlpha: number = 0;
  private _customSeparate = false;
  private _colorMask: [boolean, boolean, boolean, boolean] = [true, true, true, true];

  // 1x1 white texture for color-only rendering
  private _whiteTexture!: GlTexture;

  // Scissor
  private _scissorEnabled = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this._customSrcFactor = gl.SRC_ALPHA;
    this._customDstFactor = gl.ONE_MINUS_SRC_ALPHA;
    this._customBlendEq = gl.FUNC_ADD;

    this._vertexData = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);
    this._colorVertexData = new Float32Array(MAX_VERTICES * COLOR_FLOATS_PER_VERTEX);
    this._immVertexData = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);

    this._initShaders();
    this._initBuffers();
    this._initWhiteTexture();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    this.resize(canvas.width, canvas.height);
  }

  private _initShaders(): void {
    const gl = this.gl;
    this._spriteProgram = createShaderProgram(gl, SPRITE_VS, SPRITE_FS);
    this._spriteMvpLoc = gl.getUniformLocation(this._spriteProgram, 'uMVP')!;
    this._spriteTexLoc = gl.getUniformLocation(this._spriteProgram, 'uTex')!;

    this._spriteAlphaTestProgram = createShaderProgram(gl, SPRITE_VS, ALPHA_TEST_FS);
    this._spriteAtMvpLoc = gl.getUniformLocation(this._spriteAlphaTestProgram, 'uMVP')!;
    this._spriteAtTexLoc = gl.getUniformLocation(this._spriteAlphaTestProgram, 'uTex')!;

    this._colorProgram = createShaderProgram(gl, COLOR_VS, COLOR_FS);
    this._colorMvpLoc = gl.getUniformLocation(this._colorProgram, 'uMVP')!;
  }

  private _initBuffers(): void {
    const gl = this.gl;

    // Build index buffer for quads (0,1,2, 2,3,0 pattern)
    const indices = new Uint16Array(MAX_INDICES);
    for (let i = 0; i < MAX_QUADS; i++) {
      const vi = i * 4;
      const ii = i * 6;
      indices[ii + 0] = vi + 0;
      indices[ii + 1] = vi + 1;
      indices[ii + 2] = vi + 2;
      indices[ii + 3] = vi + 2;
      indices[ii + 4] = vi + 3;
      indices[ii + 5] = vi + 0;
    }

    // Sprite VAO
    this._vao = gl.createVertexArray()!;
    gl.bindVertexArray(this._vao);
    this._vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._vertexData.byteLength, gl.DYNAMIC_DRAW);
    this._ebo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    // aPos
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
    // aUV
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 8);
    // aColor
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_PER_VERTEX, 16);

    // Color-only VAO
    this._colorVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._colorVao);
    this._colorVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._colorVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._colorVertexData.byteLength, gl.DYNAMIC_DRAW);
    this._colorEbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._colorEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    // aPos
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, COLOR_FLOATS_PER_VERTEX * 4, 0);
    // aColor
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, COLOR_FLOATS_PER_VERTEX * 4, 8);

    // Immediate-mode VAO (same layout as sprite, with shared index buffer)
    this._immVao = gl.createVertexArray()!;
    gl.bindVertexArray(this._immVao);
    this._immVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._immVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._immVertexData.byteLength, gl.DYNAMIC_DRAW);
    this._immEbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._immEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_PER_VERTEX, 16);

    gl.bindVertexArray(null);
  }

  private _initWhiteTexture(): void {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this._whiteTexture = { id: tex, width: 1, height: 1 };
  }

  resize(width: number, height: number): void {
    this._screenWidth = width;
    this._screenHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this._currentRT === null) {
      this.gl.viewport(0, 0, width, height);
    }
    this._mvp = orthoMatrix(0, width, height, 0);
  }

  get screenWidth(): number { return this._screenWidth; }
  get screenHeight(): number { return this._screenHeight; }

  clearBackground(r: number, g: number, b: number, a: number = 1.0): void {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // --- Texture management ---

  loadTexture(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas, opts?: {
    clamp?: boolean;
    pointFilter?: boolean;
  }): GlTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const filter = opts?.pointFilter ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    const wrap = opts?.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

    const width = source instanceof ImageBitmap ? source.width :
                  source instanceof HTMLImageElement ? source.naturalWidth :
                  source.width;
    const height = source instanceof ImageBitmap ? source.height :
                   source instanceof HTMLImageElement ? source.naturalHeight :
                   source.height;

    return { id: tex, width, height };
  }

  unloadTexture(texture: GlTexture): void {
    this.gl.deleteTexture(texture.id);
  }

  // --- Render targets ---

  createRenderTarget(width: number, height: number): RenderTarget {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      throw new Error(`Framebuffer incomplete: ${status}`);
    }

    return {
      id: fbo,
      texture: { id: tex, width, height },
      width,
      height,
    };
  }

  destroyRenderTarget(rt: RenderTarget): void {
    const gl = this.gl;
    gl.deleteFramebuffer(rt.id);
    gl.deleteTexture(rt.texture.id);
  }

  beginRenderTarget(rt: RenderTarget): void {
    this.flush();
    this._rtStack.push(this._currentRT);
    this._currentRT = rt;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.id);
    gl.viewport(0, 0, rt.width, rt.height);
    // Flip Y for render targets: WebGL FBO textures store Y=0 at the bottom,
    // so we use a bottom-up projection (top=height, bottom=0) so that the
    // resulting texture can be sampled with the same UVs as screen-space.
    this._mvp = orthoMatrix(0, rt.width, 0, rt.height);
  }

  endRenderTarget(): void {
    this.flush();
    const prev = this._rtStack.pop() ?? null;
    this._currentRT = prev;
    const gl = this.gl;
    if (prev) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev.id);
      gl.viewport(0, 0, prev.width, prev.height);
      this._mvp = orthoMatrix(0, prev.width, prev.height, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this._screenWidth, this._screenHeight);
      this._mvp = orthoMatrix(0, this._screenWidth, this._screenHeight, 0);
    }
  }

  // --- Blend modes ---

  setBlendMode(mode: BlendMode): void {
    if (mode === this._currentBlend) return;
    this.flush();
    this._currentBlend = mode;
    this._applyBlendMode();
  }

  setCustomBlendFactors(srcFactor: number, dstFactor: number, blendEq: number): void {
    this.flush();
    this._customSrcFactor = srcFactor;
    this._customDstFactor = dstFactor;
    this._customBlendEq = blendEq;
    this._customSeparate = false;
    if (this._currentBlend === BlendMode.CUSTOM) {
      this._applyBlendMode();
    }
  }

  setCustomBlendFactorsSeparate(
    srcRGB: number, dstRGB: number, eqRGB: number,
    srcA: number, dstA: number, eqA: number,
  ): void {
    this.flush();
    this._customSrcFactor = srcRGB;
    this._customDstFactor = dstRGB;
    this._customBlendEq = eqRGB;
    this._customSrcAlpha = srcA;
    this._customDstAlpha = dstA;
    this._customBlendEqAlpha = eqA;
    this._customSeparate = true;
    if (this._currentBlend === BlendMode.CUSTOM) {
      this._applyBlendMode();
    }
  }

  private _applyBlendMode(): void {
    const gl = this.gl;
    switch (this._currentBlend) {
      case BlendMode.ALPHA:
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case BlendMode.ADDITIVE:
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case BlendMode.MULTIPLY:
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case BlendMode.CUSTOM:
        gl.enable(gl.BLEND);
        if (this._customSeparate) {
          gl.blendFuncSeparate(
            this._customSrcFactor, this._customDstFactor,
            this._customSrcAlpha, this._customDstAlpha,
          );
          gl.blendEquationSeparate(this._customBlendEq, this._customBlendEqAlpha);
        } else {
          gl.blendFunc(this._customSrcFactor, this._customDstFactor);
          gl.blendEquation(this._customBlendEq);
        }
        break;
      case BlendMode.NONE:
        gl.disable(gl.BLEND);
        break;
    }
  }

  setAlphaTest(enabled: boolean): void {
    if (enabled === this._useAlphaTest) return;
    this.flush();
    this._useAlphaTest = enabled;
  }

  setColorMask(r: boolean, g: boolean, b: boolean, a: boolean): void {
    this.flush();
    this._colorMask = [r, g, b, a];
    this.gl.colorMask(r, g, b, a);
  }

  // --- Scissor ---

  setScissor(x: number, y: number, w: number, h: number): void {
    this.flush();
    const gl = this.gl;
    if (!this._scissorEnabled) {
      gl.enable(gl.SCISSOR_TEST);
      this._scissorEnabled = true;
    }
    // WebGL scissor origin is bottom-left
    const canvasH = this._currentRT ? this._currentRT.height : this._screenHeight;
    gl.scissor(x, canvasH - y - h, w, h);
  }

  clearScissor(): void {
    if (!this._scissorEnabled) return;
    this.flush();
    this.gl.disable(this.gl.SCISSOR_TEST);
    this._scissorEnabled = false;
  }

  // --- Drawing ---

  /**
   * Draw a textured quad. srcRect and dstRect are in pixels.
   * srcRect: [x, y, w, h] in texture pixels
   * dstRect: [x, y, w, h] in screen pixels
   * origin: [ox, oy] pivot point relative to dstRect top-left
   * rotation: degrees
   * tint: [r, g, b, a] normalized 0-1
   */
  drawTexturePro(
    texture: GlTexture,
    srcRect: [number, number, number, number],
    dstRect: [number, number, number, number],
    origin: [number, number],
    rotation: number,
    tint: [number, number, number, number],
  ): void {
    if (this._currentTexture !== null && this._currentTexture !== texture.id) {
      this.flush();
    }
    if (this._quadCount >= MAX_QUADS) {
      this.flush();
    }
    this._currentTexture = texture.id;

    const [sx, sy, sw, sh] = srcRect;
    const [dx, dy, dw, dh] = dstRect;
    const [ox, oy] = origin;
    const [cr, cg, cb, ca] = tint;

    // UV coordinates — negative sw/sh flips the texture (raylib convention).
    // Compute UVs from the absolute rect, then swap to achieve the flip.
    const absW = sw < 0 ? -sw : sw;
    const absH = sh < 0 ? -sh : sh;
    const uLeft = sx / texture.width;
    const uRight = (sx + absW) / texture.width;
    const vTop = sy / texture.height;
    const vBottom = (sy + absH) / texture.height;
    const u0 = sw < 0 ? uRight : uLeft;
    const u1 = sw < 0 ? uLeft : uRight;
    const v0 = sh < 0 ? vBottom : vTop;
    const v1 = sh < 0 ? vTop : vBottom;

    // Compute corners relative to origin, then rotate and translate
    const rad = rotation * (Math.PI / 180.0);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const cx = dx;
    const cy = dy;

    // Corners before rotation (relative to origin)
    const corners: [number, number][] = [
      [-ox, -oy],
      [dw - ox, -oy],
      [dw - ox, dh - oy],
      [-ox, dh - oy],
    ];

    const base = this._quadCount * 4 * FLOATS_PER_VERTEX;
    const uvs: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

    for (let i = 0; i < 4; i++) {
      const [lx, ly] = corners[i];
      const rx = cos * lx - sin * ly + cx;
      const ry = sin * lx + cos * ly + cy;
      const [u, v] = uvs[i];
      const off = base + i * FLOATS_PER_VERTEX;
      this._vertexData[off + 0] = rx;
      this._vertexData[off + 1] = ry;
      this._vertexData[off + 2] = u;
      this._vertexData[off + 3] = v;
      this._vertexData[off + 4] = cr;
      this._vertexData[off + 5] = cg;
      this._vertexData[off + 6] = cb;
      this._vertexData[off + 7] = ca;
    }

    this._quadCount++;
  }

  /**
   * Draw a solid-color rectangle.
   */
  drawRectangle(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number): void {

    if (this._colorQuadCount >= MAX_QUADS) {
      this._flushColorQuads();
    }

    const base = this._colorQuadCount * 4 * COLOR_FLOATS_PER_VERTEX;
    const positions: [number, number][] = [
      [x, y], [x + w, y], [x + w, y + h], [x, y + h],
    ];

    for (let i = 0; i < 4; i++) {
      const off = base + i * COLOR_FLOATS_PER_VERTEX;
      this._colorVertexData[off + 0] = positions[i][0];
      this._colorVertexData[off + 1] = positions[i][1];
      this._colorVertexData[off + 2] = r;
      this._colorVertexData[off + 3] = g;
      this._colorVertexData[off + 4] = b;
      this._colorVertexData[off + 5] = a;
    }

    this._colorQuadCount++;
  }

  // --- Immediate-mode quad API (for bullet trails etc.) ---

  beginQuads(texture: GlTexture): void {
    this.flush();
    this._currentTexture = texture.id;
    this._immVertexCount = 0;
    this._immActive = true;
  }

  texCoord2f(u: number, v: number): void {
    this._immTexCoord = [u, v];
  }

  color4f(r: number, g: number, b: number, a: number): void {
    this._immColor = [r, g, b, a];
  }

  vertex2f(x: number, y: number): void {
    if (!this._immActive) return;
    const off = this._immVertexCount * FLOATS_PER_VERTEX;
    this._immVertexData[off + 0] = x;
    this._immVertexData[off + 1] = y;
    this._immVertexData[off + 2] = this._immTexCoord[0];
    this._immVertexData[off + 3] = this._immTexCoord[1];
    this._immVertexData[off + 4] = this._immColor[0];
    this._immVertexData[off + 5] = this._immColor[1];
    this._immVertexData[off + 6] = this._immColor[2];
    this._immVertexData[off + 7] = this._immColor[3];
    this._immVertexCount++;
  }

  endQuads(): void {
    if (!this._immActive) return;
    this._immActive = false;

    if (this._immVertexCount < 4) return;

    const gl = this.gl;
    const program = this._useAlphaTest ? this._spriteAlphaTestProgram : this._spriteProgram;
    const mvpLoc = this._useAlphaTest ? this._spriteAtMvpLoc : this._spriteMvpLoc;
    const texLoc = this._useAlphaTest ? this._spriteAtTexLoc : this._spriteTexLoc;

    gl.useProgram(program);
    gl.uniformMatrix4fv(mvpLoc, false, this._mvp);
    gl.uniform1i(texLoc, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._currentTexture);

    gl.bindVertexArray(this._immVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._immVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._immVertexData.subarray(0, this._immVertexCount * FLOATS_PER_VERTEX));

    const quadCount = (this._immVertexCount / 4) | 0;
    gl.drawElements(gl.TRIANGLES, quadCount * 6, gl.UNSIGNED_SHORT, 0);

    gl.bindVertexArray(null);
    this._immVertexCount = 0;
  }

  // --- Flush ---

  flush(): void {
    this._flushTexturedQuads();
    this._flushColorQuads();
  }

  private _flushTexturedQuads(): void {
    if (this._quadCount === 0) return;

    const gl = this.gl;
    const program = this._useAlphaTest ? this._spriteAlphaTestProgram : this._spriteProgram;
    const mvpLoc = this._useAlphaTest ? this._spriteAtMvpLoc : this._spriteMvpLoc;
    const texLoc = this._useAlphaTest ? this._spriteAtTexLoc : this._spriteTexLoc;

    gl.useProgram(program);
    gl.uniformMatrix4fv(mvpLoc, false, this._mvp);
    gl.uniform1i(texLoc, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._currentTexture);

    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexData.subarray(0, this._quadCount * 4 * FLOATS_PER_VERTEX));
    gl.drawElements(gl.TRIANGLES, this._quadCount * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    this._quadCount = 0;
  }

  private _flushColorQuads(): void {
    if (this._colorQuadCount === 0) return;

    const gl = this.gl;
    gl.useProgram(this._colorProgram);
    gl.uniformMatrix4fv(this._colorMvpLoc, false, this._mvp);

    gl.bindVertexArray(this._colorVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._colorVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._colorVertexData.subarray(0, this._colorQuadCount * 4 * COLOR_FLOATS_PER_VERTEX));
    gl.drawElements(gl.TRIANGLES, this._colorQuadCount * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    this._colorQuadCount = 0;
  }

  get whiteTexture(): GlTexture { return this._whiteTexture; }

  // --- RL_* constants for blend factor compatibility ---
  get RL_SRC_ALPHA(): number { return this.gl.SRC_ALPHA; }
  get RL_ONE_MINUS_SRC_ALPHA(): number { return this.gl.ONE_MINUS_SRC_ALPHA; }
  get RL_ONE(): number { return this.gl.ONE; }
  get RL_ZERO(): number { return this.gl.ZERO; }
  get RL_DST_COLOR(): number { return this.gl.DST_COLOR; }
  get RL_ONE_MINUS_DST_COLOR(): number { return this.gl.ONE_MINUS_DST_COLOR; }
  get RL_FUNC_ADD(): number { return this.gl.FUNC_ADD; }
  get RL_DST_ALPHA(): number { return this.gl.DST_ALPHA; }
  get RL_SRC_COLOR(): number { return this.gl.SRC_COLOR; }

  destroy(): void {
    const gl = this.gl;
    gl.deleteProgram(this._spriteProgram);
    gl.deleteProgram(this._spriteAlphaTestProgram);
    gl.deleteProgram(this._colorProgram);
    gl.deleteBuffer(this._vbo);
    gl.deleteBuffer(this._ebo);
    gl.deleteBuffer(this._colorVbo);
    gl.deleteBuffer(this._colorEbo);
    gl.deleteBuffer(this._immVbo);
    gl.deleteBuffer(this._immEbo);
    gl.deleteVertexArray(this._vao);
    gl.deleteVertexArray(this._colorVao);
    gl.deleteVertexArray(this._immVao);
    gl.deleteTexture(this._whiteTexture.id);
  }
}
