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
      const viz = new window.PersonaPointCloudVisualizer({ canvas, logger: console });
      window._viz = viz;
      await viz.initFromImage('./images/placeholder.png');
      // Attempt to hook into TTS UI audio if present
      const attachAudio = ()=>{
        try{
          const audio = document.querySelector('audio');
          if (audio) {
            viz.connectAudio(audio, null);
          }
        }catch(_){ }
      };
      attachAudio();
      const mo = new MutationObserver(()=>attachAudio());
      mo.observe(document.body, { childList:true, subtree:true });

      // Hook plan + alignment integration from AudioStream client if available
      const tryWirePlan = () => {
        try {
          const client = window.audioStreamClientInstance; // if app exposes it
          if (!client) return;
          const origHandleAudioChunk = client.handleAudioChunk.bind(client);
          client.handleAudioChunk = (data) => {
            origHandleAudioChunk(data);
            try {
              const alignment = data.alignment;
              const plan = client.latestPlan;
              if (alignment && plan && window.VisemeMapper) {
                const vis = window.VisemeMapper.mapPhonemesToVisemes(alignment.phonemes);
                const merged = window.VisemeMapper.mergeMouthTrack((plan.tracks||{}).mouth||[], vis);
                plan.tracks = plan.tracks || {};
                plan.tracks.mouth = merged;
                viz.applyPlan(plan);
              }
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


