// visualizer/PersonaPointCloudVisualizer.js
// Skeleton implementation with WebGL2 init and 2D fallback

(function () {
  class PersonaPointCloudVisualizer {
    constructor({ canvas, logger } = {}) {
      if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        throw new Error('PersonaPointCloudVisualizer: canvas is required and must be an HTMLCanvasElement');
      }
      this.canvas = canvas;
      this.logger = logger || console;
      this._gl = null;
      this._ctx2d = null;
      this._isWebGL2 = false;
      this._rafId = null;
      this._audio = {
        ctx: null,
        analyser: null,
        source: null,
        buffer: new Uint8Array(2048),
        lastLogTime: 0,
      };
      this._state = {
        mode: 'idle',
        startedAt: 0,
        speechStartCtxTime: null,
        lastAmp: 0,
      };

      this._config = {
        sampleCount: 12000,
        downsampleSize: 256,
        baseSize: 2.0,
        edgeGain: 2.5,
        ampGain: 10.0,
        shadeLevels: new Float32Array([0.15, 0.35, 0.6, 0.85]),
        styleIntensityBias: 0.0,
      };

      this._gpu = {
        program: null,
        vao: null,
        buffers: {
          instancePos: null,
          instanceLum: null,
          instanceEdge: null,
          instanceRegion: null,
          unitPoint: null,
        },
        uniforms: {
          uBaseSize: null,
          uEdgeGain: null,
          uAmp: null,
          uTime: null,
          uLevels: null,
        },
        attribs: {
          a_pos: 0,
          a_lum: 1,
          a_edge: 2,
          a_region: 3,
        },
      };

      // Dev overlay
      this._dev = {
        el: null,
        last: 0,
        enabled: true,
      };

      this._samples = {
        N: 0,
        positions: null,
        baseLum: null,
        edge: null,
        regionId: null,
      };

      this._firstFrameLogged = false;

      this._initContext();
      this._setupDevOverlay();
      this._log(`[Visualizer] WebGL2: ${this._isWebGL2}`);
      this._log('[Visualizer] init');
    }

    get isWebGL2() {
      return this._isWebGL2;
    }

    _log(msg, ...args) {
      try { this.logger?.log(msg, ...args); } catch (_) {}
    }

    _initContext() {
      try {
        const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
        if (gl) {
          this._gl = gl;
          this._isWebGL2 = true;
          return;
        }
      } catch (_) {}
      // Fallback to 2D
      this._ctx2d = this.canvas.getContext('2d', { alpha: false });
      this._isWebGL2 = false;
    }

    // Step 4: reference image sampling + importance scoring
    async initFromImage(url) {
      await this._clearFrame();
      const img = await this._loadImage(url);
      const { w, h, gray, lum } = this._rasterizeToGray(img, this._config.downsampleSize);
      const edge = this._sobel(gray, w, h);
      const score = this._computeScore(lum, edge);
      const top = this._selectTop(score, this._config.sampleCount, w, h);
      const { positions, baseLum, edgeVals, regionId } = this._buildSampleArrays(top, lum, edge, w, h);
      this._samples = {
        N: positions.length / 2,
        positions,
        baseLum,
        edge: edgeVals,
        regionId,
      };
      this._log(`[Visualizer] samples: ${this._samples.N}`);
      this._debugMinMax(this._samples.baseLum, 'lum');
      this._debugMinMax(this._samples.edge, 'edge');
      this._debugRegionCounts(this._samples.regionId);
      if (this._isWebGL2) {
        this._setupGlIfNeeded();
        this._uploadInstanceData();
      }
      this.idle();
    }

    connectAudio(audioEl, externalCtx) {
      if (!audioEl) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = externalCtx || new AudioCtx();
        const src = ctx.createMediaElementSource(audioEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        this._audio.ctx = ctx;
        this._audio.source = src;
        this._audio.analyser = analyser;
        this._audio.buffer = new Uint8Array(analyser.fftSize);
      } catch (e) {
        this._log('[Visualizer] Audio connect failed', e);
      }
    }

    applyPlan(plan) {
      // Stub for step 5/8/10
      this._plan = plan || null;
      this._log('[Visualizer] plan applied', !!plan);
    }

    applyPersonaConfig(meta = {}) {
      // Allow persona metadata to adjust core params
      const conf = this._config;
      if (typeof meta.pointCount === 'number') {
        conf.sampleCount = Math.max(1000, Math.min(20000, Math.floor(meta.pointCount)));
      }
      if (typeof meta.baseSize === 'number') conf.baseSize = meta.baseSize;
      if (typeof meta.edgeGain === 'number') conf.edgeGain = meta.edgeGain;
      if (typeof meta.ampGain === 'number') conf.ampGain = meta.ampGain;
      if (Array.isArray(meta.shadeLevels) && meta.shadeLevels.length === 4) {
        conf.shadeLevels = new Float32Array(meta.shadeLevels);
      }
      if (meta.style?.intensityBias != null) conf.styleIntensityBias = Number(meta.style.intensityBias) || 0;
      this._log(`[Visualizer] persona-config sampleCount=${conf.sampleCount} baseSize=${conf.baseSize} edgeGain=${conf.edgeGain} ampGain=${conf.ampGain}`);
    }

    async speechStart(offsetMs = 0) {
      this._log(`[Visualizer] speechStart(offsetMs=${offsetMs})`);
      this._state.mode = 'speech';
      this._state.startedAt = performance.now() - offsetMs;
      // If we have no samples yet, initialize from placeholder to avoid blank screen
      try {
        if (!this._samples || !this._samples.N || this._samples.N === 0) {
          this._log('[Visualizer] No samples at speechStart; initializing from placeholder');
          await this.initFromImage('/images/placeholder.png');
        }
      } catch(_){}
      if (this._audio && this._audio.ctx) {
        this._state.speechStartCtxTime = this._audio.ctx.currentTime - (offsetMs / 1000);
      } else {
        this._state.speechStartCtxTime = null;
      }
      this._ensureLoop();
    }

    speechStop() {
      this._log('[Visualizer] speechStop()');
      this._state.mode = 'idle';
      this._state.speechStartCtxTime = null;
      this._ensureLoop();
    }

    idle() {
      // Enter idle mode and ensure loop; throttling to ~20fps when idle is handled in overlay update
      this._state.mode = 'idle';
      this._ensureLoop();
    }

    destroy() {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = null;
      if (this._audio?.ctx) {
        try { this._audio.ctx.close(); } catch (_) {}
      }
      this._gl = null;
      this._ctx2d = null;
    }

    _ensureLoop() {
      if (this._rafId) return;
      const loop = () => {
        this._rafId = requestAnimationFrame(loop);
        const t0 = performance.now();
        const amp = this._computeAmplitude();
        if (this._isWebGL2) {
          this._drawGL(amp);
        } else if (this._ctx2d) {
          this._draw2D(amp);
        }
        const dt = performance.now() - t0;
        if (!this._firstFrameLogged && this._samples.N > 0) {
          this._firstFrameLogged = true;
          this._log(`[Visualizer] first-frame-ok dt=${dt.toFixed(2)}ms`);
        }
      };
      this._rafId = requestAnimationFrame(loop);
    }

    // ---------- Helpers: image loading and sampling ----------
    _loadImage(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    }

    async _clearFrame() {
      if (this._isWebGL2) {
        const gl = this._gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else if (this._ctx2d) {
        const ctx = this._ctx2d;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    _rasterizeToGray(img, targetSize) {
      const w = targetSize;
      const h = targetSize;
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const octx = off.getContext('2d');
      octx.fillStyle = '#000';
      octx.fillRect(0, 0, w, h);
      const scale = Math.min(w / img.width, h / img.height);
      const dw = Math.round(img.width * scale);
      const dh = Math.round(img.height * scale);
      const dx = Math.floor((w - dw) / 2);
      const dy = Math.floor((h - dh) / 2);
      octx.drawImage(img, dx, dy, dw, dh);
      const data = octx.getImageData(0, 0, w, h).data;
      const gray = new Float32Array(w * h);
      const lum = new Float32Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        gray[p] = l; lum[p] = l;
      }
      return { w, h, gray, lum };
    }

    _sobel(gray, w, h) {
      const out = new Float32Array(w * h);
      const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let sx = 0, sy = 0, k = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const v = gray[(y + j) * w + (x + i)];
              sx += v * gx[k]; sy += v * gy[k]; k++;
            }
          }
          out[y * w + x] = Math.hypot(sx, sy);
        }
      }
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < out.length; i++) { const v = out[i]; if (v < min) min = v; if (v > max) max = v; }
      const range = max - min || 1;
      for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
      return out;
    }

    _computeScore(lum, edge) {
      const N = lum.length;
      const score = new Float32Array(N);
      for (let i = 0; i < N; i++) score[i] = 0.6 * edge[i] + 0.4 * (1 - lum[i]);
      return score;
    }

    _selectTop(score, N, w, h) {
      const total = w * h;
      const idx = new Uint32Array(total);
      for (let i = 0; i < total; i++) idx[i] = i;
      idx.sort((a, b) => score[b] - score[a]);
      const count = Math.min(N, total);
      return idx.subarray(0, count);
    }

    _buildSampleArrays(topIdx, lum, edge, w, h) {
      const n = topIdx.length;
      const positions = new Float32Array(n * 2);
      const baseLum = new Float32Array(n);
      const edgeVals = new Float32Array(n);
      const regionId = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const p = topIdx[i];
        const y = Math.floor(p / w);
        const x = p - y * w;
        const nx = (x / (w - 1)) * 2 - 1;
        const ny = 1 - (y / (h - 1)) * 2;
        positions[i * 2 + 0] = nx;
        positions[i * 2 + 1] = ny;
        baseLum[i] = lum[p];
        edgeVals[i] = edge[p];
        regionId[i] = this._regionFromPos(nx, ny);
      }
      return { positions, baseLum, edgeVals, regionId };
    }

    _regionFromPos(nx, ny) {
      if (ny < -0.55) return 4; // shoulders
      if (ny < -0.15 && Math.abs(nx) < 0.35) return 1; // mouth
      if (ny >= 0.05 && ny <= 0.35 && Math.abs(nx) < 0.6) return 2; // eyes
      if (ny > 0.35 && ny <= 0.55 && Math.abs(nx) < 0.6) return 3; // brows
      return 0; // head
    }

    _debugMinMax(arr, label) {
      let min = Infinity, max = -Infinity, bad = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (!isFinite(v)) bad++;
        if (v < min) min = v; if (v > max) max = v;
      }
      this._log(`[Visualizer] ${label} min=${min.toFixed(4)} max=${max.toFixed(4)} bad=${bad}`);
    }

    _debugRegionCounts(regionId) {
      const counts = new Array(5).fill(0);
      for (let i = 0; i < regionId.length; i++) counts[regionId[i]]++;
      const sum = counts.reduce((a, b) => a + b, 0);
      this._log(`[Visualizer] regions head=${counts[0]} mouth=${counts[1]} eyes=${counts[2]} brows=${counts[3]} shoulders=${counts[4]} sum=${sum}`);
    }

    // ---------- WebGL2 pipeline ----------
    _setupGlIfNeeded() {
      if (!this._isWebGL2) return;
      const gl = this._gl;
      if (this._gpu.program) return;
      const vs = `#version 300 es\n
        layout(location=0) in vec2 a_pos;\n
        layout(location=1) in float a_lum;\n
        layout(location=2) in float a_edge;\n
        layout(location=3) in float a_region;\n
        out float v_lum;\n
        uniform float uBaseSize;\n
        uniform float uEdgeGain;\n
        uniform float uAmp;\n
        uniform float uTime;\n
        uniform float uMouthOpen;\n
        uniform float uMouthWidth;\n
        uniform float uMouthRound;\n
        uniform float uBrowsY;\n
        uniform float uEyeBlink;\n
        uniform float uHeadTilt;\n
        uniform float uShouldersY;\n
        uniform float uStyleIntensity;\n
        void main(){\n
          v_lum = a_lum;\n
          float ct = cos(uHeadTilt);\n
          float st = sin(uHeadTilt);\n
          vec2 pos = vec2( a_pos.x * ct - a_pos.y * st, a_pos.x * st + a_pos.y * ct );\n
          if (abs(a_region - 3.0) < 0.5) { pos.y += uBrowsY; }\n
          else if (abs(a_region - 4.0) < 0.5) { pos.y += uShouldersY; }\n
          float size = uBaseSize + uEdgeGain * a_edge;\n
          if (abs(a_region - 2.0) < 0.5) { size *= mix(1.0, 0.2, clamp(uEyeBlink, 0.0, 1.0)); }\n
          else if (abs(a_region - 1.0) < 0.5) { float mouthBoost = 0.5 * uMouthOpen + 0.25 * uMouthWidth + 0.25 * uMouthRound; size += mouthBoost; }\n
          size = max(1.0, size + uAmp);\n
          gl_PointSize = size;\n
          gl_Position = vec4(pos, 0.0, 1.0);\n
        }`;
      const fs = `#version 300 es\n
        precision highp float;\n
        in float v_lum;\n
        out vec4 outColor;\n
        uniform vec4 uLevels;\n
        void main(){\n
          vec2 pc = gl_PointCoord * 2.0 - 1.0;\n
          float r = length(pc);\n
          if (r > 1.0) discard;\n
          float v = v_lum;\n
          float shade = 0.0;\n
          if (v < uLevels.x) shade = 0.15;\n
          else if (v < uLevels.y) shade = 0.35;\n
          else if (v < uLevels.z) shade = 0.6;\n
          else shade = 0.85;\n
          outColor = vec4(vec3(shade), 1.0);\n
        }`;
      const prog = this._createProgram(gl, vs, fs);
      this._gpu.program = prog;
      this._gpu.uniforms.uBaseSize = gl.getUniformLocation(prog, 'uBaseSize');
      this._gpu.uniforms.uEdgeGain = gl.getUniformLocation(prog, 'uEdgeGain');
      this._gpu.uniforms.uAmp = gl.getUniformLocation(prog, 'uAmp');
      this._gpu.uniforms.uTime = gl.getUniformLocation(prog, 'uTime');
      this._gpu.uniforms.uLevels = gl.getUniformLocation(prog, 'uLevels');
      this._gpu.uniforms.uMouthOpen = gl.getUniformLocation(prog, 'uMouthOpen');
      this._gpu.uniforms.uMouthWidth = gl.getUniformLocation(prog, 'uMouthWidth');
      this._gpu.uniforms.uMouthRound = gl.getUniformLocation(prog, 'uMouthRound');
      this._gpu.uniforms.uBrowsY = gl.getUniformLocation(prog, 'uBrowsY');
      this._gpu.uniforms.uEyeBlink = gl.getUniformLocation(prog, 'uEyeBlink');
      this._gpu.uniforms.uHeadTilt = gl.getUniformLocation(prog, 'uHeadTilt');
      this._gpu.uniforms.uShouldersY = gl.getUniformLocation(prog, 'uShouldersY');
      this._gpu.uniforms.uStyleIntensity = gl.getUniformLocation(prog, 'uStyleIntensity');

      this._gpu.buffers.unitPoint = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.unitPoint);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0]), gl.STATIC_DRAW);

      this._gpu.buffers.instanceLum = gl.createBuffer();
      this._gpu.buffers.instanceEdge = gl.createBuffer();
      this._gpu.buffers.instanceRegion = gl.createBuffer();

      const vao = gl.createVertexArray();
      this._gpu.vao = vao;
      gl.bindVertexArray(vao);

      // Instance positions reuse a_pos location with divisor 1
      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.unitPoint);
      gl.enableVertexAttribArray(this._gpu.attribs.a_pos);
      gl.vertexAttribPointer(this._gpu.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(this._gpu.attribs.a_pos, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.instanceLum);
      gl.enableVertexAttribArray(this._gpu.attribs.a_lum);
      gl.vertexAttribPointer(this._gpu.attribs.a_lum, 1, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(this._gpu.attribs.a_lum, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.instanceEdge);
      gl.enableVertexAttribArray(this._gpu.attribs.a_edge);
      gl.vertexAttribPointer(this._gpu.attribs.a_edge, 1, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(this._gpu.attribs.a_edge, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.instanceRegion);
      gl.enableVertexAttribArray(this._gpu.attribs.a_region);
      gl.vertexAttribPointer(this._gpu.attribs.a_region, 1, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(this._gpu.attribs.a_region, 1);

      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    _uploadInstanceData() {
      const gl = this._gl;
      if (!this._samples || !this._samples.positions) return;
      gl.bindVertexArray(this._gpu.vao);
      // Overwrite a_pos buffer with positions (per-instance)
      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.unitPoint);
      gl.bufferData(gl.ARRAY_BUFFER, this._samples.positions, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this._gpu.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(this._gpu.attribs.a_pos, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.instanceLum);
      gl.bufferData(gl.ARRAY_BUFFER, this._samples.baseLum, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.instanceEdge);
      gl.bufferData(gl.ARRAY_BUFFER, this._samples.edge, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buffers.instanceRegion);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this._samples.regionId), gl.STATIC_DRAW);

      gl.bindVertexArray(null);
    }

    _drawGL(amp) {
      const gl = this._gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!this._gpu.program || !this._gpu.vao || this._samples.N === 0) return;
      const tMsCtx = this._state.speechStartCtxTime != null && this._audio?.ctx
        ? (this._audio.ctx.currentTime - this._state.speechStartCtxTime) * 1000
        : (performance.now() - this._state.startedAt);
      const params = this._getCurrentParams(tMsCtx, amp || 0);
      this._updateDevOverlay(tMsCtx);
      gl.useProgram(this._gpu.program);
      gl.bindVertexArray(this._gpu.vao);
      gl.uniform1f(this._gpu.uniforms.uBaseSize, this._config.baseSize);
      gl.uniform1f(this._gpu.uniforms.uEdgeGain, this._config.edgeGain);
      gl.uniform1f(this._gpu.uniforms.uAmp, (amp || 0) * this._config.ampGain);
      gl.uniform1f(this._gpu.uniforms.uTime, (performance.now() - this._state.startedAt) * 0.001);
      gl.uniform4fv(this._gpu.uniforms.uLevels, this._config.shadeLevels);
      gl.uniform1f(this._gpu.uniforms.uMouthOpen, params.mouth.open);
      gl.uniform1f(this._gpu.uniforms.uMouthWidth, params.mouth.width);
      gl.uniform1f(this._gpu.uniforms.uMouthRound, params.mouth.round);
      gl.uniform1f(this._gpu.uniforms.uBrowsY, params.browsY);
      gl.uniform1f(this._gpu.uniforms.uEyeBlink, params.eyeBlink);
      gl.uniform1f(this._gpu.uniforms.uHeadTilt, params.headTilt);
      gl.uniform1f(this._gpu.uniforms.uShouldersY, params.shouldersY);
      gl.uniform1f(this._gpu.uniforms.uStyleIntensity, params.styleIntensity);
      gl.drawArraysInstanced(gl.POINTS, 0, 1, this._samples.N);
      gl.bindVertexArray(null);
    }

    _draw2D(amp) {
      const ctx = this._ctx2d;
      const N = this._samples.N;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      if (N === 0) return;
      const tMsCtx = this._state.speechStartCtxTime != null && this._audio?.ctx
        ? (this._audio.ctx.currentTime - this._state.speechStartCtxTime) * 1000
        : (performance.now() - this._state.startedAt);
      const params = this._getCurrentParams(tMsCtx, amp || 0);
      this._updateDevOverlay(tMsCtx);
      const base = this._config.baseSize;
      const edgeGain = this._config.edgeGain;
      for (let i = 0; i < N; i++) {
        const nx = this._samples.positions[i * 2 + 0];
        const ny = this._samples.positions[i * 2 + 1];
        const e = this._samples.edge[i];
        const px = Math.round((nx * 0.5 + 0.5) * this.canvas.width);
        let yy = ny;
        const region = this._samples.regionId[i];
        if (region === 3) yy += params.browsY;
        if (region === 4) yy += params.shouldersY;
        const py = Math.round(((-yy) * 0.5 + 0.5) * this.canvas.height);
        let size = Math.max(1, base + edgeGain * e + (amp || 0) * this._config.ampGain);
        if (region === 2) { size *= (1 - 0.8 * Math.max(0, Math.min(1, params.eyeBlink))); }
        else if (region === 1) { size += 0.5 * params.mouth.open + 0.25 * params.mouth.width + 0.25 * params.mouth.round; }
        const l = this._samples.baseLum[i];
        let shade = 0.0;
        const lv = this._config.shadeLevels;
        if (l < lv[0]) shade = 0.15; else if (l < lv[1]) shade = 0.35; else if (l < lv[2]) shade = 0.6; else shade = 0.85;
        const gray = Math.floor(shade * 255);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.beginPath();
        ctx.arc(px, py, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---------- Plan sampling ----------
    _getCurrentParams(tMs, amp=0) {
      const tracks = this._plan?.tracks || {};
      let mouth = this._sampleMouth(tracks.mouth || [], tMs);
      let browsYTrack = this._sampleScalar(tracks.brows || [], 'y', tMs);
      let eyeBlinkTrack = this._sampleBlink(tracks.eyes || [], tMs);
      let headTiltDegTrack = this._sampleScalar(tracks.headTilt || [], 'deg', tMs);
      let shouldersYTrack = this._sampleScalar(tracks.shoulders || [], 'y', tMs);
      const styleIntensityPlan = typeof tracks.style?.intensity === 'number' ? tracks.style.intensity : 0.0;
      const styleIntensity = styleIntensityPlan + (this._config.styleIntensityBias||0);
      if (this._state.mode !== 'speech') {
        const t = (performance.now() * 0.001);
        const sway = Math.sin(t * 0.6) * 0.02;
        const breath = (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.05;
        return { mouth: { open: 0, width: 0, round: 0 }, browsY: sway * 0.5, eyeBlink: 0, headTilt: sway, shouldersY: breath * 0.3, styleIntensity };
      }
      // Speech mode fallback: if no explicit mouth track, modulate by audio amplitude (more pronounced)
      if (!tracks.mouth || tracks.mouth.length === 0) {
        const a = Math.min(1, Math.max(0, amp));
        mouth = { open: a * 3.0, width: a * 1.2, round: a * 0.9 };
      }
      // Procedural body motion during speech if tracks are missing
      const t = (this._state.speechStartCtxTime != null && this._audio?.ctx) ? ((this._audio.ctx.currentTime - this._state.speechStartCtxTime)) : ((performance.now() - this._state.startedAt) * 0.001);
      const a = Math.min(1, Math.max(0, amp));
      if (!tracks.brows || tracks.brows.length === 0) {
        browsYTrack = 0.01 + 0.03 * Math.sin(t * 2.0) + 0.03 * a;
      }
      if (!tracks.eyes || tracks.eyes.length === 0) {
        // Quick procedural blink roughly every ~1.5-2.2s
        const blinkPhase = (t % 1.8);
        eyeBlinkTrack = blinkPhase < 0.12 ? (1.0 - blinkPhase/0.12) : 0.0;
      }
      if (!tracks.headTilt || tracks.headTilt.length === 0) {
        headTiltDegTrack = (Math.sin(t * 0.9) * (3 + 7 * a));
      }
      if (!tracks.shoulders || tracks.shoulders.length === 0) {
        shouldersYTrack = 0.02 * Math.sin(t * 1.1) + 0.03 * a;
      }
      return {
        mouth,
        browsY: browsYTrack * 0.05,
        eyeBlink: eyeBlinkTrack,
        headTilt: (headTiltDegTrack * Math.PI) / 180,
        shouldersY: shouldersYTrack * 0.05,
        styleIntensity: styleIntensity + a * 0.2,
      };
    }

    _sampleMouth(track, tMs) {
      if (!track || track.length === 0) return { open: 0, width: 0, round: 0 };
      let last = track[0];
      for (let i = 0; i < track.length; i++) { const k = track[i]; if (k.t <= tMs) last = k; else break; }
      return { open: last.open || 0, width: last.width || 0, round: last.round || 0 };
    }

    _sampleScalar(track, key, tMs) {
      if (!track || track.length === 0) return 0;
      let last = track[0][key] || 0;
      for (let i = 0; i < track.length; i++) { const k = track[i]; if (k.t <= tMs) last = k[key] || 0; else break; }
      return last;
    }

    _sampleBlink(track, tMs) {
      if (!track || track.length === 0) return 0;
      let v = 0;
      for (let i = 0; i < track.length; i++) { const k = track[i]; if (!k.blink) continue; const dt = Math.abs(tMs - k.t); const w = 80.0; if (dt <= w) v = Math.max(v, 1.0 - (dt / w)); }
      return v;
    }

    _computeAmplitude() {
      const a = this._audio;
      if (!a.analyser) return 0;
      a.analyser.getByteTimeDomainData(a.buffer);
      let sum = 0;
      for (let i = 0; i < a.buffer.length; i++) {
        const v = (a.buffer[i] - 128) / 128;
        sum += v * v;
      }
      let rms = Math.sqrt(sum / a.buffer.length);
      // Boost and smooth amplitude to improve visible response
      rms = Math.min(1, rms * 2.5);
      this._state.lastAmp = this._state.lastAmp * 0.85 + rms * 0.15;
      const out = this._state.lastAmp;
      const now = performance.now();
      if (now - a.lastLogTime > 1000) { this._log(`[Visualizer] amp=${out.toFixed(3)}`); a.lastLogTime = now; }
      return out;
    }

    _createProgram(gl, vsSource, fsSource) {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(vs); gl.deleteShader(vs); throw new Error('VS compile failed: ' + info);
      }
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fsSource);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(fs); gl.deleteShader(fs); gl.deleteShader(vs); throw new Error('FS compile failed: ' + info);
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(prog); gl.deleteProgram(prog); throw new Error('Program link failed: ' + info);
      }
      return prog;
    }
  }

  // Dev overlay helpers
  PersonaPointCloudVisualizer.prototype._setupDevOverlay = function(){
    try{
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:8px;bottom:8px;padding:6px 8px;background:rgba(0,0,0,0.45);color:#8fdaff;font-family:monospace;font-size:12px;border-radius:4px;pointer-events:none;z-index:5;';
      el.textContent = 't=0ms viseme=—';
      this.canvas.parentElement?.appendChild(el);
      this._dev.el = el;
    }catch(_){}
  };
  PersonaPointCloudVisualizer.prototype._updateDevOverlay = function(tMs){
    const now = performance.now();
    if (!this._dev.el || !this._dev.enabled) return;
    if (now - (this._dev.last||0) < 50) return; // ~20fps
    this._dev.last = now;
    const vis = this._currentVisemeAt(tMs);
    this._dev.el.textContent = `t=${Math.round(tMs)}ms viseme=${vis||'—'}`;
  };
  PersonaPointCloudVisualizer.prototype.setDevOverlayVisible = function(show){
    this._dev.enabled = !!show;
    if (this._dev.el) this._dev.el.style.display = this._dev.enabled ? '' : 'none';
  };
  PersonaPointCloudVisualizer.prototype.toggleDevOverlay = function(){
    this.setDevOverlayVisible(!this._dev.enabled);
  };
  PersonaPointCloudVisualizer.prototype._currentVisemeAt = function(tMs){
    const track = this._plan?.tracks?.mouth || [];
    let lab = null;
    for (let i=0;i<track.length;i++){
      const k = track[i];
      if (k.t <= tMs) lab = k.viseme || lab; else break;
    }
    return lab;
  };

  // expose globally for DevTools
  window.PersonaPointCloudVisualizer = PersonaPointCloudVisualizer;
})();

// ---- Private helpers implementation appended ----
// Image load, clear, rasterization, sobel, score, selection,
// sample building, region inference, debug logs, WebGL setup/draw,
// 2D draw, amplitude calculation, shader program creation
// Implemented above in class methods.
