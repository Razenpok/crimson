// Port of grim/raylib_api.py

// Browser/WebGL implementation backing the Raylib API facade. Python's
// raylib_api.py only re-exports pyray/raylib; this file provides the equivalent
// renderer for the browser port.

export enum BlendMode {
  ALPHA,
  ADDITIVE,
  MULTIPLY,
  CUSTOM,
  NONE,
}

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
uniform float uGammaGain;
out vec4 fragColor;
void main() {
  vec4 texel = texture(uTex, vUV) * vColor;
  texel.rgb = clamp(texel.rgb * max(uGammaGain, 0.0), 0.0, 1.0);
  fragColor = texel;
}`;

const ALPHA_TEST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uTex;
uniform float uGammaGain;
out vec4 fragColor;
void main() {
  vec4 texel = texture(uTex, vUV) * vColor;
  if (texel.a <= 0.0156862745) discard;
  texel.rgb = clamp(texel.rgb * max(uGammaGain, 0.0), 0.0, 1.0);
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
uniform float uGammaGain;
out vec4 fragColor;
void main() {
  vec4 color = vColor;
  color.rgb = clamp(color.rgb * max(uGammaGain, 0.0), 0.0, 1.0);
  fragColor = color;
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

const FLOATS_PER_VERTEX = 8;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;
const MAX_QUADS = 8192;
const MAX_VERTICES = MAX_QUADS * 4;
const MAX_INDICES = MAX_QUADS * 6;

const COLOR_FLOATS_PER_VERTEX = 6;
const CUSTOM_FLOATS_PER_VERTEX = 9;

export interface ShaderQuadVertex {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

function required<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} failed`);
  }
  return value;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = required(gl.createShader(type), 'createShader');
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
  const program = required(gl.createProgram(), 'createProgram');
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

  private _spriteProgram!: WebGLProgram;
  private _spriteAlphaTestProgram!: WebGLProgram;
  private _colorProgram!: WebGLProgram;
  private _spriteMvpLoc!: WebGLUniformLocation;
  private _spriteTexLoc!: WebGLUniformLocation;
  private _spriteGammaGainLoc!: WebGLUniformLocation;
  private _spriteAtMvpLoc!: WebGLUniformLocation;
  private _spriteAtTexLoc!: WebGLUniformLocation;
  private _spriteAtGammaGainLoc!: WebGLUniformLocation;
  private _colorMvpLoc!: WebGLUniformLocation;
  private _colorGammaGainLoc!: WebGLUniformLocation;
  private _gammaGain = 1.0;

  private _vao!: WebGLVertexArrayObject;
  private _vbo!: WebGLBuffer;
  private _ebo!: WebGLBuffer;
  private _vertexData: Float32Array;
  private _quadCount = 0;
  private _currentTexture: WebGLTexture | null = null;
  private _currentBlend: BlendMode = BlendMode.ALPHA;
  private _useAlphaTest = false;

  private _colorVao!: WebGLVertexArrayObject;
  private _colorVbo!: WebGLBuffer;
  private _colorEbo!: WebGLBuffer;
  private _colorVertexData: Float32Array;
  private _colorQuadCount = 0;

  private _immVao!: WebGLVertexArrayObject;
  private _immVbo!: WebGLBuffer;
  private _immEbo!: WebGLBuffer;
  private _immVertexData: Float32Array;
  private _immVertexCount = 0;
  private _immActive = false;
  private _immTexCoord: [number, number] = [0, 0];
  private _immColor: [number, number, number, number] = [1, 1, 1, 1];

  private _customVao!: WebGLVertexArrayObject;
  private _customVbo!: WebGLBuffer;
  private _customEbo!: WebGLBuffer;
  private _customVertexData: Float32Array;

  private _screenWidth = 0;
  private _screenHeight = 0;
  private _mvp!: Float32Array;

  private _rtStack: (RenderTarget | null)[] = [];
  private _currentRT: RenderTarget | null = null;

  private _customSrcFactor: number;
  private _customDstFactor: number;
  private _customBlendEq: number;
  private _customSrcAlpha: number = 0;
  private _customDstAlpha: number = 0;
  private _customBlendEqAlpha: number = 0;
  private _customSeparate = false;

  private _whiteTexture!: GlTexture;

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
    this._customVertexData = new Float32Array(4 * CUSTOM_FLOATS_PER_VERTEX);

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
    this._spriteMvpLoc = required(gl.getUniformLocation(this._spriteProgram, 'uMVP'), 'getUniformLocation uMVP');
    this._spriteTexLoc = required(gl.getUniformLocation(this._spriteProgram, 'uTex'), 'getUniformLocation uTex');
    this._spriteGammaGainLoc = required(gl.getUniformLocation(this._spriteProgram, 'uGammaGain'), 'getUniformLocation uGammaGain');

    this._spriteAlphaTestProgram = createShaderProgram(gl, SPRITE_VS, ALPHA_TEST_FS);
    this._spriteAtMvpLoc = required(gl.getUniformLocation(this._spriteAlphaTestProgram, 'uMVP'), 'getUniformLocation uMVP');
    this._spriteAtTexLoc = required(gl.getUniformLocation(this._spriteAlphaTestProgram, 'uTex'), 'getUniformLocation uTex');
    this._spriteAtGammaGainLoc = required(gl.getUniformLocation(this._spriteAlphaTestProgram, 'uGammaGain'), 'getUniformLocation uGammaGain');

    this._colorProgram = createShaderProgram(gl, COLOR_VS, COLOR_FS);
    this._colorMvpLoc = required(gl.getUniformLocation(this._colorProgram, 'uMVP'), 'getUniformLocation uMVP');
    this._colorGammaGainLoc = required(gl.getUniformLocation(this._colorProgram, 'uGammaGain'), 'getUniformLocation uGammaGain');
  }

  private _initBuffers(): void {
    const gl = this.gl;

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

    this._vao = required(gl.createVertexArray(), 'createVertexArray');
    gl.bindVertexArray(this._vao);
    this._vbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._vertexData.byteLength, gl.DYNAMIC_DRAW);
    this._ebo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_PER_VERTEX, 16);

    this._colorVao = required(gl.createVertexArray(), 'createVertexArray');
    gl.bindVertexArray(this._colorVao);
    this._colorVbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._colorVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._colorVertexData.byteLength, gl.DYNAMIC_DRAW);
    this._colorEbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._colorEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, COLOR_FLOATS_PER_VERTEX * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, COLOR_FLOATS_PER_VERTEX * 4, 8);

    this._immVao = required(gl.createVertexArray(), 'createVertexArray');
    gl.bindVertexArray(this._immVao);
    this._immVbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._immVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._immVertexData.byteLength, gl.DYNAMIC_DRAW);
    this._immEbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._immEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_PER_VERTEX, 16);

    this._customVao = required(gl.createVertexArray(), 'createVertexArray');
    gl.bindVertexArray(this._customVao);
    this._customVbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._customVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._customVertexData.byteLength, gl.DYNAMIC_DRAW);
    this._customEbo = required(gl.createBuffer(), 'createBuffer');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._customEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 2, 3, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, CUSTOM_FLOATS_PER_VERTEX * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, CUSTOM_FLOATS_PER_VERTEX * 4, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, CUSTOM_FLOATS_PER_VERTEX * 4, 20);

    gl.bindVertexArray(null);
  }

  private _initWhiteTexture(): void {
    const gl = this.gl;
    const tex = required(gl.createTexture(), 'createTexture');
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

  setGammaGain(gain: number): void {
    const next = Math.max(0.0, gain);
    if (Math.abs(next - this._gammaGain) <= 1e-6) return;
    this.flush();
    this._gammaGain = next;
  }

  loadTexture(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas, opts?: {
    clamp?: boolean;
    pointFilter?: boolean;
  }): GlTexture {
    const gl = this.gl;
    const tex = required(gl.createTexture(), 'createTexture');
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

  createRenderTarget(width: number, height: number): RenderTarget {
    const gl = this.gl;
    const tex = required(gl.createTexture(), 'createTexture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = required(gl.createFramebuffer(), 'createFramebuffer');
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

  setTextureFilter(texture: GlTexture, filter: number): void {
    const gl = this.gl;
    this.flush();
    gl.bindTexture(gl.TEXTURE_2D, texture.id);
    const glFilter = filter === 1 ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
  }

  setTextureWrap(texture: GlTexture, wrap: number): void {
    const gl = this.gl;
    this.flush();
    gl.bindTexture(gl.TEXTURE_2D, texture.id);
    const glWrap = wrap === 1 ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap);
  }

  beginRenderTarget(rt: RenderTarget): void {
    this.flush();
    this._rtStack.push(this._currentRT);
    this._currentRT = rt;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.id);
    gl.viewport(0, 0, rt.width, rt.height);
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
      this._mvp = orthoMatrix(0, prev.width, 0, prev.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this._screenWidth, this._screenHeight);
      this._mvp = orthoMatrix(0, this._screenWidth, this._screenHeight, 0);
    }
  }

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
    this.gl.colorMask(r, g, b, a);
  }

  setScissor(x: number, y: number, w: number, h: number): void {
    this.flush();
    const gl = this.gl;
    if (!this._scissorEnabled) {
      gl.enable(gl.SCISSOR_TEST);
      this._scissorEnabled = true;
    }
    const canvasH = this._currentRT ? this._currentRT.height : this._screenHeight;
    gl.scissor(x, canvasH - y - h, w, h);
  }

  clearScissor(): void {
    if (!this._scissorEnabled) return;
    this.flush();
    this.gl.disable(this.gl.SCISSOR_TEST);
    this._scissorEnabled = false;
  }

  drawTexturePro(
    texture: GlTexture,
    srcRect: { x: number; y: number; w: number; h: number },
    dstRect: { x: number; y: number; w: number; h: number },
    origin: { x: number; y: number },
    rotation: number,
    tint: { r: number; g: number; b: number; a: number },
  ): void {
    if (this._colorQuadCount > 0) {
      this._flushColorQuads();
    }
    if (this._currentTexture !== null && this._currentTexture !== texture.id) {
      this.flush();
    }
    if (this._quadCount >= MAX_QUADS) {
      this.flush();
    }
    this._currentTexture = texture.id;

    const { x: sx, y: sy, w: sw, h: sh } = srcRect;
    const { x: dx, y: dy, w: dw, h: dh } = dstRect;
    const { x: ox, y: oy } = origin;
    const { r: cr, g: cg, b: cb, a: ca } = tint;

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

    const rad = rotation * (Math.PI / 180.0);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const cx = dx;
    const cy = dy;

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

  drawRectangle(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number): void {
    if (this._quadCount > 0) {
      this._flushTexturedQuads();
    }

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
    gl.uniform1f(this._useAlphaTest ? this._spriteAtGammaGainLoc : this._spriteGammaGainLoc, this._gammaGain);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._currentTexture);

    gl.bindVertexArray(this._immVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._immVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._immVertexData.subarray(0, this._immVertexCount * FLOATS_PER_VERTEX));

    const quadCount = int(this._immVertexCount / 4);
    gl.drawElements(gl.TRIANGLES, quadCount * 6, gl.UNSIGNED_SHORT, 0);

    gl.bindVertexArray(null);
    this._immVertexCount = 0;
  }

  createShaderProgram(vsSource: string, fsSource: string): WebGLProgram {
    this.flush();
    return createShaderProgram(this.gl, vsSource, fsSource);
  }

  getShaderLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(program, name);
  }

  setShaderFloat(program: WebGLProgram, location: WebGLUniformLocation | null, value: number): void {
    if (location === null) return;
    const gl = this.gl;
    gl.useProgram(program);
    gl.uniform1f(location, value);
  }

  setShaderVec4(
    program: WebGLProgram,
    location: WebGLUniformLocation | null,
    x: number,
    y: number,
    z: number,
    w: number,
  ): void {
    if (location === null) return;
    const gl = this.gl;
    gl.useProgram(program);
    gl.uniform4f(location, x, y, z, w);
  }

  drawShaderQuad(program: WebGLProgram, mvpLocation: WebGLUniformLocation | null, vertices: readonly ShaderQuadVertex[]): void {
    if (vertices.length !== 4) return;
    this.flush();

    const gl = this.gl;
    gl.useProgram(program);
    if (mvpLocation !== null) {
      gl.uniformMatrix4fv(mvpLocation, false, this._mvp);
    }

    for (let i = 0; i < 4; i++) {
      const vertex = vertices[i];
      const off = i * CUSTOM_FLOATS_PER_VERTEX;
      this._customVertexData[off + 0] = vertex.x;
      this._customVertexData[off + 1] = vertex.y;
      this._customVertexData[off + 2] = vertex.z;
      this._customVertexData[off + 3] = vertex.u;
      this._customVertexData[off + 4] = vertex.v;
      this._customVertexData[off + 5] = vertex.r;
      this._customVertexData[off + 6] = vertex.g;
      this._customVertexData[off + 7] = vertex.b;
      this._customVertexData[off + 8] = vertex.a;
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(this._customVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._customVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._customVertexData);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

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
    gl.uniform1f(this._useAlphaTest ? this._spriteAtGammaGainLoc : this._spriteGammaGainLoc, this._gammaGain);

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
    gl.uniform1f(this._colorGammaGainLoc, this._gammaGain);

    gl.bindVertexArray(this._colorVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._colorVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._colorVertexData.subarray(0, this._colorQuadCount * 4 * COLOR_FLOATS_PER_VERTEX));
    gl.drawElements(gl.TRIANGLES, this._colorQuadCount * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    this._colorQuadCount = 0;
  }

  get whiteTexture(): GlTexture { return this._whiteTexture; }

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
    gl.deleteBuffer(this._customVbo);
    gl.deleteBuffer(this._customEbo);
    gl.deleteVertexArray(this._vao);
    gl.deleteVertexArray(this._colorVao);
    gl.deleteVertexArray(this._immVao);
    gl.deleteVertexArray(this._customVao);
    gl.deleteTexture(this._whiteTexture.id);
  }
}
