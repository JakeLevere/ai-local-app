// Facial Detection Enhancements for Visualizer Editor
// This file contains all improvements for accurate facial feature coordinate detection

// ============================================================================
// ENHANCED PROMPT FOR BETTER FACIAL LANDMARK DETECTION
// ============================================================================
function enhancedDefaultPrompt() {
  return `You are a precise facial landmark detector. Given a 120x120 face crop, analyze and return ONLY a JSON object with this schema:
{
  "frameId": <int 1-based>,
  "chunkNumber": <int 1-based>,
  "frameNumberInChunk": 1..6,
  "coords": {
    "leftEye": {"x": <0..119>, "y": <0..119>, "confidence": <0..1>},
    "rightEye": {"x": <0..119>, "y": <0..119>, "confidence": <0..1>},
    "mouth": {"x": <0..119>, "y": <0..119>, "confidence": <0..1>}
  },
  "actions": {"eyes": "<=5 words", "mouth": "<=5 words"},
  "meta": {"src": "<filename>", "w": 120, "h": 120, "model": "openai|ollama"}
}

CRITICAL Rules for accurate detection:
- The leftEye should be the pupil/iris center of the person's LEFT eye (viewer's right side)
- The rightEye should be the pupil/iris center of the person's RIGHT eye (viewer's left side)
- The mouth should be the center point between the upper and lower lips
- Use high confidence (0.8-1.0) when features are clearly visible
- Use medium confidence (0.5-0.7) when partially obscured
- Use low confidence (0.2-0.4) when guessing position
- For a typical forward-facing portrait:
  * Eyes are usually located at y: 35-55 (upper third of face)
  * Eyes are horizontally spaced at approximately x: 30-45 (left) and x: 75-90 (right)
  * Mouth is typically at y: 75-95 (lower third of face), x: 55-65 (center)
- If the face is turned, adjust coordinates accordingly
- Output ONLY valid JSON, no markdown or extra text`;
}

// ============================================================================
// IMPROVED COORDINATE SANITIZATION WITH PRECISION PRESERVATION
// ============================================================================
function enhancedSanitizeDescriptor(obj, clamp, wordClamp) {
  const before = JSON.stringify(obj);
  for(const p of ['leftEye','rightEye','mouth']){
    const c = obj.coords[p];
    // Keep decimal precision instead of rounding for high confidence
    c.x = clamp(c.x, 0, 119);
    c.y = clamp(c.y, 0, 119);
    c.confidence = clamp(+c.confidence, 0, 1);
    
    // Only round if confidence is low (indicating uncertainty)
    if(c.confidence < 0.7) {
      c.x = Math.round(c.x);
      c.y = Math.round(c.y);
    }
  }
  obj.actions.eyes = wordClamp(obj.actions.eyes || '', 5);
  obj.actions.mouth = wordClamp(obj.actions.mouth || '', 5);
  const after = JSON.stringify(obj);
  return {
    descriptor: obj,
    changed: before !== after
  };
}

// ============================================================================
// IMAGE QUALITY VALIDATION
// ============================================================================
async function validateImageQuality(imgBlob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imgBlob);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 120, 120);
      
      // Check image brightness/contrast
      const imageData = ctx.getImageData(0, 0, 120, 120);
      const data = imageData.data;
      let totalBrightness = 0;
      let minBrightness = 255;
      let maxBrightness = 0;
      
      for(let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
        totalBrightness += brightness;
        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
      }
      
      const avgBrightness = totalBrightness / (data.length / 4);
      const contrast = maxBrightness - minBrightness;
      URL.revokeObjectURL(url);
      
      resolve({
        isValid: avgBrightness > 30 && avgBrightness < 225 && contrast > 50,
        avgBrightness: avgBrightness,
        contrast: contrast
      });
    };
    
    img.src = url;
  });
}

// ============================================================================
// IMAGE ENHANCEMENT FOR BETTER DETECTION
// ============================================================================
async function enhanceImageForDetection(imgBlob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imgBlob);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      
      // Draw original image
      ctx.drawImage(img, 0, 0, 120, 120);
      
      // Get image data for processing
      let imageData = ctx.getImageData(0, 0, 120, 120);
      const data = imageData.data;
      
      // Calculate histogram for auto-levels adjustment
      const histogram = new Array(256).fill(0);
      for(let i = 0; i < data.length; i += 4) {
        const brightness = Math.round((data[i] + data[i+1] + data[i+2]) / 3);
        histogram[brightness]++;
      }
      
      // Find 5th and 95th percentile for auto-levels
      const totalPixels = (data.length / 4);
      const lowThreshold = Math.floor(totalPixels * 0.05);
      const highThreshold = Math.floor(totalPixels * 0.95);
      
      let cumulative = 0;
      let lowLevel = 0, highLevel = 255;
      
      for(let i = 0; i < 256; i++) {
        cumulative += histogram[i];
        if(cumulative >= lowThreshold && lowLevel === 0) lowLevel = i;
        if(cumulative >= highThreshold) { highLevel = i; break; }
      }
      
      // Apply auto-levels and slight contrast boost
      const scale = 255 / (highLevel - lowLevel);
      for(let i = 0; i < data.length; i += 4) {
        // Apply levels adjustment
        data[i] = Math.max(0, Math.min(255, (data[i] - lowLevel) * scale));
        data[i+1] = Math.max(0, Math.min(255, (data[i+1] - lowLevel) * scale));
        data[i+2] = Math.max(0, Math.min(255, (data[i+2] - lowLevel) * scale));
      }
      
      // Apply subtle sharpening
      const sharpenKernel = [
        0, -0.5, 0,
        -0.5, 3, -0.5,
        0, -0.5, 0
      ];
      
      // Create temporary canvas for sharpening
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 120;
      tempCanvas.height = 120;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      
      // Apply sharpening filter
      ctx.filter = 'contrast(1.1) brightness(1.05)';
      ctx.drawImage(tempCanvas, 0, 0);
      
      // Convert to blob
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/png', 0.95);
    };
    
    img.src = url;
  });
}

// ============================================================================
// ENHANCED MODEL CALLING WITH RETRY LOGIC
// ============================================================================
async function enhancedCallModel(imgBlob, id, videoIndex, chunkNumber, frameNumberInChunk, attemptNum = 0, config) {
  const b64 = await blobToBase64(imgBlob);
  
  // Use provided chunk info or calculate fallback
  if(!chunkNumber) chunkNumber = Math.ceil(id/6);
  if(!frameNumberInChunk) frameNumberInChunk = ((id-1)%6)+1;
  if(!videoIndex) videoIndex = config.videoIndex;

  const sys = config.promptText || enhancedDefaultPrompt();
  
  // Add additional context for retries
  const retryHint = attemptNum > 0 ? 
    `\nThis is attempt ${attemptNum + 1}. Please be especially precise with coordinate detection. Look carefully for the exact center of pupils and the midpoint of lips.` : '';

  if(config.model.kind === 'openai'){
    if(!config.model.key) throw new Error('Missing OpenAI key');
    const url = config.model.base.replace(/\/$/,'') + '/v1/chat/completions';
    
    // Use better model and parameters for improved accuracy
    const modelName = config.model.name.includes('mini') ? 'gpt-4o' : config.model.name;
    
    const body = {
      model: modelName,
      messages: [
        {role:'system', content: sys + retryHint},
        {role:'user', content:[
          {
            type:'text', 
            text:`Analyze this facial image precisely. frameId=${id}, chunk=${chunkNumber}, inChunk=${frameNumberInChunk}. 
                  Carefully locate the exact center of each eye's pupil and the center point of the mouth. 
                  Focus on precision - look for the darkest part of each eye (the pupil) and the midline of the lips.
                  Return ONLY JSON with accurate coordinates.`
          },
          {type:'image_url', image_url:{url:`data:image/png;base64,${b64}`, detail: 'high'}}
        ]}
      ],
      temperature: 0.3 + (attemptNum * 0.1), // Slightly increase temperature on retries
      max_tokens: 500, // Increased for more detailed analysis
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0
    };
    
    console.log('[OpenAI Request] Frame', id, '- Attempt', attemptNum + 1);
    
    const res = await fetch(url, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer ' + config.model.key
      },
      body:JSON.stringify(body)
    });
    
    if(!res.ok) {
      const errorText = await res.text();
      console.error('[OpenAI Error] Frame', id, '- Status:', res.status, 'Response:', errorText);
      throw new Error(`OpenAI API error ${res.status}: ${errorText}`);
    }
    
    const j = await res.json();
    console.log('[OpenAI Success] Frame', id, '- Response received');
    return j.choices?.[0]?.message?.content || '';
    
  } else {
    // Ollama implementation
    const host = config.ollama.host.replace(/\/$/,'');
    const prompt = sys + retryHint + `\nReturn ONLY JSON. frameId=${id}, chunk=${chunkNumber}, inChunk=${frameNumberInChunk}.`;
    const body = { 
      model: config.ollama.model, 
      prompt, 
      images: [b64], 
      stream: false,
      options: {
        temperature: 0.3 + (attemptNum * 0.1),
        num_predict: 500
      }
    };
    
    const res = await fetch(host+'/api/generate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    
    if(!res.ok) throw new Error('Ollama error '+res.status);
    const j = await res.json();
    return j.response || '';
  }
}

// ============================================================================
// MULTI-PASS ANALYSIS WITH CONFIDENCE TRACKING
// ============================================================================
async function analyzeWithConfidenceTracking(frame, maxRetries, config) {
  let bestDescriptor = null;
  let highestConfidence = 0;
  const attempts = [];
  
  for(let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Get image blob
      let imgBlob = frame.blob;
      
      // Validate and enhance image quality
      const quality = await validateImageQuality(imgBlob);
      if(!quality.isValid && attempt === 0) {
        console.log(`[Analyze] Enhancing frame ${frame.id} - brightness: ${quality.avgBrightness.toFixed(1)}, contrast: ${quality.contrast.toFixed(1)}`);
        imgBlob = await enhanceImageForDetection(imgBlob);
      }
      
      // Call model with enhanced parameters
      const raw = await enhancedCallModel(
        imgBlob, 
        frame.id, 
        frame.videoIndex, 
        frame.chunkNumber, 
        frame.frameNumberInChunk, 
        attempt,
        config
      );
      
      // Parse response
      const txt = (raw||'').replace(/^```\s*json|^```|```$/g,'').trim();
      const parsed = JSON.parse(txt);
      
      // Calculate average confidence
      const avgConfidence = (
        parsed.coords.leftEye.confidence +
        parsed.coords.rightEye.confidence +
        parsed.coords.mouth.confidence
      ) / 3;
      
      attempts.push({
        attempt: attempt + 1,
        confidence: avgConfidence,
        descriptor: parsed
      });
      
      // Track best result
      if(avgConfidence > highestConfidence) {
        highestConfidence = avgConfidence;
        bestDescriptor = parsed;
      }
      
      // If we achieve high confidence, stop early
      if(avgConfidence > 0.85) {
        console.log(`[Analyze] Frame ${frame.id} achieved high confidence: ${avgConfidence.toFixed(2)} on attempt ${attempt + 1}`);
        return {
          success: true,
          descriptor: parsed,
          confidence: avgConfidence,
          attempts: attempts
        };
      }
      
    } catch(err) {
      console.warn(`[Analyze] Frame ${frame.id} attempt ${attempt + 1} failed:`, err.message);
    }
  }
  
  // Return best result
  if(bestDescriptor) {
    console.log(`[Analyze] Frame ${frame.id} using best result with confidence: ${highestConfidence.toFixed(2)}`);
    return {
      success: true,
      descriptor: bestDescriptor,
      confidence: highestConfidence,
      attempts: attempts
    };
  }
  
  return {
    success: false,
    descriptor: null,
    confidence: 0,
    attempts: attempts
  };
}

// ============================================================================
// ENHANCED COORDINATE VISUALIZATION
// ============================================================================
function drawEnhancedCoordinate(ctx, x, y, confidence, label, scale) {
  // Color based on confidence
  let color;
  if(confidence > 0.8) color = '#00ff00'; // Green - high confidence
  else if(confidence > 0.5) color = '#ffff00'; // Yellow - medium
  else color = '#ff0000'; // Red - low confidence
  
  // Main point
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x * scale, y * scale, 5, 0, 2 * Math.PI);
  ctx.stroke();
  
  // Add crosshair for precision
  ctx.beginPath();
  ctx.moveTo((x - 3) * scale, y * scale);
  ctx.lineTo((x + 3) * scale, y * scale);
  ctx.moveTo(x * scale, (y - 3) * scale);
  ctx.lineTo(x * scale, (y + 3) * scale);
  ctx.stroke();
  
  // Confidence ring
  if(confidence < 1.0) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x * scale, y * scale, 8 + (1 - confidence) * 10, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
  
  // Add label with confidence
  ctx.fillStyle = color;
  ctx.font = 'bold 12px monospace';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 3;
  ctx.fillText(`${label}: ${(confidence * 100).toFixed(0)}%`, x * scale + 10, y * scale - 5);
  
  // Add coordinate info
  ctx.font = '10px monospace';
  ctx.fillText(`(${x.toFixed(1)}, ${y.toFixed(1)})`, x * scale + 10, y * scale + 8);
  ctx.shadowBlur = 0;
}

// ============================================================================
// DRAW FACIAL FEATURE ALIGNMENT GUIDES
// ============================================================================
function drawAlignmentGuides(ctx, descriptor, scale) {
  const leftEye = descriptor.coords.leftEye;
  const rightEye = descriptor.coords.rightEye;
  const mouth = descriptor.coords.mouth;
  
  // Draw eye line for alignment check
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(leftEye.x * scale, leftEye.y * scale);
  ctx.lineTo(rightEye.x * scale, rightEye.y * scale);
  ctx.stroke();
  
  // Draw vertical center line
  const centerX = (leftEye.x + rightEye.x) / 2;
  ctx.beginPath();
  ctx.moveTo(centerX * scale, 0);
  ctx.lineTo(centerX * scale, 120 * scale);
  ctx.stroke();
  
  // Draw face triangle
  ctx.strokeStyle = 'rgba(138,209,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(leftEye.x * scale, leftEye.y * scale);
  ctx.lineTo(rightEye.x * scale, rightEye.y * scale);
  ctx.lineTo(mouth.x * scale, mouth.y * scale);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Calculate and display face metrics
  const eyeDistance = Math.sqrt(
    Math.pow(rightEye.x - leftEye.x, 2) + 
    Math.pow(rightEye.y - leftEye.y, 2)
  );
  const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI;
  const faceSymmetry = Math.abs(mouth.x - centerX);
  
  // Display metrics
  ctx.fillStyle = '#8ad1ff';
  ctx.font = '11px monospace';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 2;
  ctx.fillText(`Eye Distance: ${eyeDistance.toFixed(1)}px`, 10, 120 * scale - 30);
  ctx.fillText(`Eye Angle: ${eyeAngle.toFixed(1)}°`, 10, 120 * scale - 18);
  ctx.fillText(`Symmetry: ${faceSymmetry.toFixed(1)}px off`, 10, 120 * scale - 6);
  ctx.shadowBlur = 0;
}

// ============================================================================
// BATCH PROCESSING WITH PROGRESS TRACKING
// ============================================================================
async function processBatchWithProgress(frames, config, onProgress) {
  const results = [];
  const batchSize = config.concurrency || 3;
  const maxRetries = config.maxRetries || 2;
  
  for(let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (frame) => {
      const result = await analyzeWithConfidenceTracking(frame, maxRetries, config);
      return {
        frameId: frame.id,
        ...result
      };
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Report progress
    if(onProgress) {
      const progress = Math.min(100, ((i + batch.length) / frames.length) * 100);
      const avgConfidence = batchResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / batchResults.length;
      onProgress({
        progress: progress,
        processed: i + batch.length,
        total: frames.length,
        avgConfidence: avgConfidence,
        lastBatch: batchResults
      });
    }
  }
  
  return results;
}

// ============================================================================
// EXPORT ENHANCED ANALYSIS REPORT
// ============================================================================
function generateAnalysisReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    totalFrames: results.length,
    statistics: {
      avgConfidence: 0,
      highConfidenceFrames: 0,
      mediumConfidenceFrames: 0,
      lowConfidenceFrames: 0,
      failedFrames: 0
    },
    confidenceDistribution: {
      eyes: { left: [], right: [] },
      mouth: []
    },
    outliers: [],
    recommendations: []
  };
  
  // Calculate statistics
  let totalConfidence = 0;
  results.forEach(r => {
    if(!r.success) {
      report.statistics.failedFrames++;
      return;
    }
    
    const conf = r.confidence || 0;
    totalConfidence += conf;
    
    if(conf > 0.8) report.statistics.highConfidenceFrames++;
    else if(conf > 0.5) report.statistics.mediumConfidenceFrames++;
    else report.statistics.lowConfidenceFrames++;
    
    // Track confidence distribution
    if(r.descriptor) {
      report.confidenceDistribution.eyes.left.push(r.descriptor.coords.leftEye.confidence);
      report.confidenceDistribution.eyes.right.push(r.descriptor.coords.rightEye.confidence);
      report.confidenceDistribution.mouth.push(r.descriptor.coords.mouth.confidence);
      
      // Identify outliers
      const eyeDist = Math.abs(r.descriptor.coords.leftEye.x - r.descriptor.coords.rightEye.x);
      if(eyeDist < 20 || eyeDist > 70) {
        report.outliers.push({
          frameId: r.frameId,
          issue: 'Unusual eye spacing',
          distance: eyeDist
        });
      }
    }
  });
  
  report.statistics.avgConfidence = totalConfidence / Math.max(1, results.length - report.statistics.failedFrames);
  
  // Generate recommendations
  if(report.statistics.avgConfidence < 0.7) {
    report.recommendations.push('Consider improving lighting conditions for better detection');
  }
  if(report.statistics.lowConfidenceFrames > results.length * 0.2) {
    report.recommendations.push('Many frames have low confidence - check face visibility and image quality');
  }
  if(report.outliers.length > results.length * 0.1) {
    report.recommendations.push('Multiple outliers detected - verify face orientation and framing');
  }
  
  return report;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
async function blobToBase64(blob) {
  const ab = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  for(let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ============================================================================
// CONSENSUS COORDINATE CALCULATION
// ============================================================================
function computeConsensusCoordinates(passes) {
  if(!passes || passes.length === 0) return null;
  if(passes.length === 1) return passes[0];
  
  // Calculate median coordinates for each point
  const consensus = JSON.parse(JSON.stringify(passes[0])); // Deep clone structure
  
  ['leftEye', 'rightEye', 'mouth'].forEach(point => {
    const xValues = passes.map(p => p.coords?.[point]?.x || 60).filter(x => !isNaN(x)).sort((a,b) => a-b);
    const yValues = passes.map(p => p.coords?.[point]?.y || 60).filter(y => !isNaN(y)).sort((a,b) => a-b);
    const confValues = passes.map(p => p.coords?.[point]?.confidence || 0.5).filter(c => !isNaN(c)).sort((a,b) => a-b);
    
    // Use median for robustness against outliers
    const medianIndex = Math.floor(xValues.length / 2);
    consensus.coords[point] = {
      x: xValues.length > 0 ? xValues[medianIndex] : 60,
      y: yValues.length > 0 ? yValues[medianIndex] : 60,
      confidence: confValues.length > 0 ? confValues[medianIndex] : 0.5
    };
  });
  
  // Use most common action descriptions
  ['eyes', 'mouth'].forEach(action => {
    const actions = passes.map(p => p.actions?.[action] || '').filter(a => a);
    if(actions.length > 0) {
      // Find most frequent action
      const counts = {};
      actions.forEach(a => counts[a] = (counts[a] || 0) + 1);
      consensus.actions[action] = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }
  });
  
  return consensus;
}

// ============================================================================
// VALIDATE AND REFINE COORDINATES
// ============================================================================
function validateAndRefineCoordinates(descriptor, options = {}) {
  const { imageWidth = 120, imageHeight = 120, enforceAnatomicalConstraints = true } = options;
  
  if(!descriptor || !descriptor.coords) return descriptor;
  
  const refined = JSON.parse(JSON.stringify(descriptor)); // Deep clone
  
  // Ensure coordinates are within image bounds
  ['leftEye', 'rightEye', 'mouth'].forEach(point => {
    if(refined.coords[point]) {
      refined.coords[point].x = Math.max(0, Math.min(imageWidth - 1, refined.coords[point].x));
      refined.coords[point].y = Math.max(0, Math.min(imageHeight - 1, refined.coords[point].y));
    }
  });
  
  if(enforceAnatomicalConstraints) {
    // Ensure eyes are roughly horizontal
    const eyeYDiff = Math.abs(refined.coords.leftEye.y - refined.coords.rightEye.y);
    if(eyeYDiff > 20) {
      // Average the y coordinates
      const avgY = (refined.coords.leftEye.y + refined.coords.rightEye.y) / 2;
      refined.coords.leftEye.y = avgY;
      refined.coords.rightEye.y = avgY;
      // Lower confidence due to correction
      refined.coords.leftEye.confidence *= 0.8;
      refined.coords.rightEye.confidence *= 0.8;
    }
    
    // Ensure proper eye spacing (not too close or far)
    const eyeXDist = Math.abs(refined.coords.leftEye.x - refined.coords.rightEye.x);
    if(eyeXDist < 20) {
      // Eyes too close - adjust outward
      const centerX = (refined.coords.leftEye.x + refined.coords.rightEye.x) / 2;
      refined.coords.leftEye.x = centerX - 20;
      refined.coords.rightEye.x = centerX + 20;
      refined.coords.leftEye.confidence *= 0.7;
      refined.coords.rightEye.confidence *= 0.7;
    } else if(eyeXDist > 80) {
      // Eyes too far - adjust inward
      const centerX = (refined.coords.leftEye.x + refined.coords.rightEye.x) / 2;
      refined.coords.leftEye.x = centerX - 40;
      refined.coords.rightEye.x = centerX + 40;
      refined.coords.leftEye.confidence *= 0.7;
      refined.coords.rightEye.confidence *= 0.7;
    }
    
    // Ensure mouth is below eyes
    const avgEyeY = (refined.coords.leftEye.y + refined.coords.rightEye.y) / 2;
    if(refined.coords.mouth.y <= avgEyeY) {
      refined.coords.mouth.y = avgEyeY + 30; // Place mouth reasonably below eyes
      refined.coords.mouth.confidence *= 0.6;
    }
    
    // Ensure mouth is horizontally centered between eyes
    const eyeCenterX = (refined.coords.leftEye.x + refined.coords.rightEye.x) / 2;
    const mouthXDiff = Math.abs(refined.coords.mouth.x - eyeCenterX);
    if(mouthXDiff > 20) {
      refined.coords.mouth.x = eyeCenterX;
      refined.coords.mouth.confidence *= 0.8;
    }
  }
  
  return refined;
}

// ============================================================================
// AUTO-CORRECT DESCRIPTOR
// ============================================================================
function autoCorrectDescriptor(descriptor, options = {}) {
  const { preserveHighConfidence = true } = options;
  
  if(!descriptor) return descriptor;
  
  const corrected = JSON.parse(JSON.stringify(descriptor)); // Deep clone
  
  // Only correct low-confidence points if preserveHighConfidence is true
  ['leftEye', 'rightEye', 'mouth'].forEach(point => {
    if(!corrected.coords[point]) {
      // Add missing point with default values
      const defaults = {
        leftEye: { x: 40, y: 45, confidence: 0.3 },
        rightEye: { x: 80, y: 45, confidence: 0.3 },
        mouth: { x: 60, y: 85, confidence: 0.3 }
      };
      corrected.coords[point] = defaults[point];
    } else if(!preserveHighConfidence || corrected.coords[point].confidence < 0.7) {
      // Apply typical face proportions for correction
      const typical = {
        leftEye: { x: 40, y: 45 },
        rightEye: { x: 80, y: 45 },
        mouth: { x: 60, y: 85 }
      };
      
      // Blend current values with typical values based on confidence
      const conf = corrected.coords[point].confidence;
      const blendFactor = conf; // Higher confidence = less correction
      
      corrected.coords[point].x = corrected.coords[point].x * blendFactor + typical[point].x * (1 - blendFactor);
      corrected.coords[point].y = corrected.coords[point].y * blendFactor + typical[point].y * (1 - blendFactor);
    }
  });
  
  // Ensure all required fields exist
  corrected.frameId = corrected.frameId || 1;
  corrected.chunkNumber = corrected.chunkNumber || 1;
  corrected.frameNumberInChunk = corrected.frameNumberInChunk || 1;
  corrected.actions = corrected.actions || { eyes: 'steady', mouth: 'closed' };
  corrected.meta = corrected.meta || { src: 'frame.png', w: 120, h: 120, model: 'enhanced' };
  
  return corrected;
}

// ============================================================================
// INTEGRATION HELPER
// ============================================================================
window.FacialDetectionEnhancements = {
  enhancedDefaultPrompt,
  enhancedSanitizeDescriptor,
  validateImageQuality,
  enhanceImageForDetection,
  enhancedCallModel,
  analyzeWithConfidenceTracking,
  drawEnhancedCoordinate,
  drawAlignmentGuides,
  processBatchWithProgress,
  generateAnalysisReport,
  blobToBase64,
  computeConsensusCoordinates,
  validateAndRefineCoordinates,
  autoCorrectDescriptor
};

console.log('[Facial Detection Enhancements] Module loaded successfully');
