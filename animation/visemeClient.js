// Phoneme to viseme mapping and merge with GPT plan mouth track
// Exposes window.VisemeMapper

(function(){
  const PHONEME_TO_VISEME = {
    BMP: 'BMP', F: 'FV', V: 'FV', FV: 'FV', L: 'L', AA: 'AA', AE: 'AE', AO: 'AO', IY: 'IY', UW: 'UW', TH: 'TH', CH: 'CH', R: 'R', N: 'N', S: 'S', Z: 'S', HH: 'S', OW: 'AO', EH: 'AE', UW0: 'UW', IY0: 'IY', SIL: 'SIL'
  };

  function mapPhonemesToVisemes(phonemes){
    const out = [];
    for(const ph of (phonemes||[])){
      const p = String(ph.p||'').toUpperCase();
      const vis = PHONEME_TO_VISEME[p] || 'SIL';
      out.push({ t: ph.t||0, viseme: vis });
    }
    return out;
  }

  function mergeMouthTrack(planMouth, phonemeVisemes){
    // Replace timing using phoneme events; retain open/width/round envelope from nearest plan key
    const withParams = [];
    const plan = planMouth || [];
    for(const ev of (phonemeVisemes||[])){
      const base = _sampleNearest(plan, ev.t) || { open: 0.2, width: 0.2, round: 0.2 };
      withParams.push({ t: ev.t, viseme: ev.viseme, open: base.open, width: base.width, round: base.round });
    }
    // Apply short attack/decay smoothing (~70ms)
    const ATTACK = 70, DECAY = 70;
    for(let i=0;i<withParams.length;i++){
      const a = withParams[i];
      const prev = withParams[i-1];
      const next = withParams[i+1];
      if(prev){ const dt = a.t - prev.t; if(dt<ATTACK){ const k = dt/ATTACK; a.open*=k; a.width*=k; a.round*=k; } }
      if(next){ const dt = next.t - a.t; if(dt<DECAY){ const k = dt/DECAY; a.open*=k; a.width*=k; a.round*=k; } }
    }
    return withParams;
  }

  function _sampleNearest(track, t){
    if(!track||track.length===0) return null;
    let nearest = track[0];
    let best = Math.abs((nearest.t||0)-t);
    for(const k of track){
      const d = Math.abs((k.t||0)-t);
      if(d<best){ best=d; nearest=k; }
    }
    return nearest;
  }

  window.VisemeMapper = { mapPhonemesToVisemes, mergeMouthTrack };
})();


