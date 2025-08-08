// Bridge: wires renderer audio + alignment to the visualizer
(function(){
  const wait = (sel, timeout=5000) => new Promise((res, rej)=>{
    const el = document.querySelector(sel);
    if (el) return res(el);
    const t0 = performance.now();
    const iv = setInterval(()=>{
      const e = document.querySelector(sel);
      if (e) { clearInterval(iv); res(e); }
      else if (performance.now()-t0>timeout){ clearInterval(iv); rej(new Error('timeout')); }
    }, 100);
  });

  async function initBridge(){
    try{
      const canvas = await wait('#persona-visualizer');
      // Ensure canvas has proper pixel size
      const sizeCanvas = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      };
      sizeCanvas();
      const ro = new ResizeObserver(() => sizeCanvas());
      ro.observe(canvas);

      const viz = new window.PersonaPointCloudVisualizer({ canvas, logger: console });
      window._viz = viz;
      await viz.initFromImage('/images/placeholder.png');
      // Attempt to hook into TTS UI audio if present
      const attachAudio = () =>{
        try{
          const audio = document.querySelector('audio');
          // If streaming client is present, it will manage speechStart/Stop with global offsets
          if (window.audioStreamClientInstance) {
            if (audio && !audio._vizHookedCtxOnly) {
              audio._vizHookedCtxOnly = true;
              viz.connectAudio(audio, null);
            }
            return;
          }
          if (audio && !audio._vizHooked) {
            audio._vizHooked = true;
            viz.connectAudio(audio, null);
            const onPlay = () => { try { viz.speechStart((audio.currentTime||0)*1000); } catch(_){} };
            const onPause = () => { try { viz.speechStop(); } catch(_){} };
            const onEnded = () => { try { viz.speechStop(); } catch(_){} };
            audio.addEventListener('playing', onPlay);
            audio.addEventListener('pause', onPause);
            audio.addEventListener('ended', onEnded);
          }
        }catch(_){ }
      };
      attachAudio();
      const mo = new MutationObserver(() =>attachAudio());
      mo.observe(document.body, { childList:true, subtree:true });

      // Hook plan + alignment integration from AudioStream client if available
      const tryWirePlan = () => {
        try {
          const client = window.audioStreamClientInstance; // if app exposes it
          if (!client) return;

          function excitementFromText(text){
            if (!text) return 0.35;
            let e = 0.25 + Math.min(0.75, (text.length||0)/400);
            const bangs = (text.match(/!/g)||[]).length;
            const caps = (text.match(/[A-Z]{3,}/g)||[]).length;
            e += Math.min(0.4, bangs*0.08 + caps*0.05);
            return Math.max(0.2, Math.min(1.0, e));
          }

          function buildBodyPlan(startMs, durationMs, excitement){
            const tracks = {};
            const T = Math.max(500, durationMs||2000);
            const ex = excitement==null?0.4:excitement;
            // Brows up slightly then settle
            tracks.brows = [
              { t: startMs + 0, y: 0 },
              { t: startMs + Math.min(400, T*0.2), y: 0.02 + ex*0.03 },
              { t: startMs + Math.max(0, T-250), y: 0.0 },
            ];
            // Eye blinks at start and mid
            tracks.eyes = [ { t: startMs + 300, blink: true }, { t: startMs + Math.min(T-200, 1100), blink: true } ];
            // Head tilt oscillation in degrees
            tracks.headTilt = [
              { t: startMs + 0, deg: -2 - ex*3 },
              { t: startMs + Math.min(T*0.5, 1200), deg: 2 + ex*3 },
              { t: startMs + T, deg: 0 }
            ];
            // Shoulders gentle bounce
            tracks.shoulders = [
              { t: startMs + 0, y: 0.0 },
              { t: startMs + Math.min(500, T*0.25), y: 0.02 + ex*0.02 },
              { t: startMs + Math.min(1000, T*0.5), y: -0.015 - ex*0.015 },
              { t: startMs + Math.max(0, T-100), y: 0.0 }
            ];
            tracks.style = { intensity: 0.3 + ex*0.6 };
            return { tracks };
          }

          const origHandleAudioChunk = client.handleAudioChunk.bind(client);
          client.handleAudioChunk = (data) => {
            origHandleAudioChunk(data);
            try {
              const alignment = data.alignment;
              const startMs = client.runningOffsetMs || 0;
              const durationMs = alignment?.durationMs || 0;
              const excitement = excitementFromText(data.text);
              // Ensure a plan object exists
              client.latestPlan = client.latestPlan || { tracks: {} };
              // Merge mouth visemes if available
              if (alignment && window.VisemeMapper) {
                const vis = window.VisemeMapper.mapPhonemesToVisemes(alignment.phonemes);
                const merged = window.VisemeMapper.mergeMouthTrack((client.latestPlan.tracks.mouth||[]), vis);
                client.latestPlan.tracks.mouth = merged;
              }
              // Add/refresh body plan for this segment
              const segPlan = buildBodyPlan(startMs, durationMs, excitement);
              // Shallow merge tracks (append arrays)
              client.latestPlan.tracks.brows = [ ...(client.latestPlan.tracks.brows||[]), ...(segPlan.tracks.brows||[]) ];
              client.latestPlan.tracks.eyes = [ ...(client.latestPlan.tracks.eyes||[]), ...(segPlan.tracks.eyes||[]) ];
              client.latestPlan.tracks.headTilt = [ ...(client.latestPlan.tracks.headTilt||[]), ...(segPlan.tracks.headTilt||[]) ];
              client.latestPlan.tracks.shoulders = [ ...(client.latestPlan.tracks.shoulders||[]), ...(segPlan.tracks.shoulders||[]) ];
              client.latestPlan.tracks.style = segPlan.tracks.style;
              // Apply to visualizer
              viz.applyPlan(client.latestPlan);
            } catch (_) {}
          };
          // Also apply plan messages directly if they arrive separately (e.g., fallback plan)
          const origHandleMessage = client.handleMessage.bind(client);
          client.handleMessage = (payload) => {
            origHandleMessage(payload);
            try {
              if (payload && payload.type === 'animation_plan' && payload.plan) {
                viz.applyPlan(payload.plan);
              }
            } catch(_){}
          };
        } catch(_){}
      };
      tryWirePlan();
      setTimeout(tryWirePlan, 500);
      setTimeout(tryWirePlan, 1500);
      console.log('[VisualizerBridge] Ready');
    }catch(e){ console.warn('[VisualizerBridge] init skipped:', e.message); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBridge);
  } else {
    initBridge();
  }
})();


