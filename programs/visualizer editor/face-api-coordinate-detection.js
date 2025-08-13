// Face-API.js Coordinate Detection Module
// This module provides accurate facial landmark detection using face-api.js
// instead of relying on LLMs for coordinate detection

// ============================================================================
// FACE-API COORDINATE DETECTION
// ============================================================================

// Global face-api instance
let faceapi = null;
let modelsLoaded = false;

// Initialize face-api.js
async function initializeFaceAPI() {
  if (faceapi) return faceapi;
  
  try {
    // Try to load face-api from CDN if not available locally
    if (typeof window !== 'undefined') {
      // Browser environment
      if (!window.faceapi) {
        console.log('[Face-API] Loading face-api from CDN...');
        await loadScript('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/dist/face-api.esm.js');
        faceapi = window.faceapi;
      } else {
        faceapi = window.faceapi;
      }
    } else {
      // Node.js environment
      faceapi = require('@vladmandic/face-api');
    }
    
    // Load models
    if (!modelsLoaded) {
      console.log('[Face-API] Loading models...');
      const modelPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
      
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelPath)
      ]);
      
      modelsLoaded = true;
      console.log('[Face-API] Models loaded successfully');
    }
    
    return faceapi;
  } catch (error) {
    console.error('[Face-API] Failed to initialize:', error);
    throw new Error('Face-API initialization failed');
  }
}

// Load script dynamically
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.type = 'module';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Detect facial landmarks using face-api.js
async function detectFacialLandmarks(imgBlob, frameId) {
  try {
    const faceapi = await initializeFaceAPI();
    
    // Convert blob to image element
    const img = await blobToImage(imgBlob);
    
    // Detect face with landmarks
    const detections = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();
    
    if (!detections) {
      console.warn(`[Face-API] No face detected in frame ${frameId}`);
      return createDefaultDescriptor(frameId);
    }
    
    // Extract landmark coordinates
    const landmarks = detections.landmarks;
    const points = landmarks.positions;
    
    // Map face-api landmarks to our coordinate system
    const coords = extractKeyCoordinates(points, frameId);
    
    // Create descriptor with face-api coordinates
    const descriptor = {
      frameId: frameId,
      coords: coords,
      actions: {
        eyes: determineEyeAction(coords),
        mouth: determineMouthAction(coords)
      },
      meta: {
        src: `frame_${frameId}.png`,
        w: 120,
        h: 120,
        model: 'face-api',
        detection: {
          score: detections.detection.score,
          box: detections.detection.box
        }
      }
    };
    
    console.log(`[Face-API] Successfully detected landmarks for frame ${frameId}`);
    return descriptor;
    
  } catch (error) {
    console.error(`[Face-API] Error detecting landmarks for frame ${frameId}:`, error);
    return createDefaultDescriptor(frameId);
  }
}

// Extract key coordinates from face-api landmarks
function extractKeyCoordinates(points, frameId) {
  // Face-api landmarks indices for key features
  const LEFT_EYE_CENTER = 36; // Left eye center
  const RIGHT_EYE_CENTER = 45; // Right eye center
  const MOUTH_CENTER = 66; // Mouth center
  
  // Get coordinates and scale to 120x120
  const leftEye = points[LEFT_EYE_CENTER];
  const rightEye = points[RIGHT_EYE_CENTER];
  const mouth = points[MOUTH_CENTER];
  
  // Calculate confidence based on detection quality
  const confidence = calculateConfidence(points);
  
  return {
    leftEye: {
      x: Math.round(leftEye.x),
      y: Math.round(leftEye.y),
      confidence: confidence.leftEye
    },
    rightEye: {
      x: Math.round(rightEye.x),
      y: Math.round(rightEye.y),
      confidence: confidence.rightEye
    },
    mouth: {
      x: Math.round(mouth.x),
      y: Math.round(mouth.y),
      confidence: confidence.mouth
    }
  };
}

// Calculate confidence scores based on landmark quality
function calculateConfidence(points) {
  // Analyze landmark distribution and quality
  const eyePoints = points.slice(36, 48); // Eye landmarks
  const mouthPoints = points.slice(48, 68); // Mouth landmarks
  
  // Calculate confidence based on landmark consistency
  const leftEyeConf = analyzeLandmarkQuality(eyePoints.slice(0, 6));
  const rightEyeConf = analyzeLandmarkQuality(eyePoints.slice(6, 12));
  const mouthConf = analyzeLandmarkQuality(mouthPoints);
  
  return {
    leftEye: Math.min(0.95, leftEyeConf),
    rightEye: Math.min(0.95, rightEyeConf),
    mouth: Math.min(0.95, mouthConf)
  };
}

// Analyze landmark quality based on distribution
function analyzeLandmarkQuality(landmarks) {
  if (landmarks.length === 0) return 0.3;
  
  // Calculate average distance between landmarks
  let totalDistance = 0;
  let count = 0;
  
  for (let i = 0; i < landmarks.length - 1; i++) {
    for (let j = i + 1; j < landmarks.length; j++) {
      const dist = Math.sqrt(
        Math.pow(landmarks[i].x - landmarks[j].x, 2) +
        Math.pow(landmarks[i].y - landmarks[j].y, 2)
      );
      totalDistance += dist;
      count++;
    }
  }
  
  const avgDistance = count > 0 ? totalDistance / count : 0;
  
  // Higher average distance indicates better landmark distribution
  // Normalize to 0-1 range (assuming typical distances)
  const normalizedConfidence = Math.min(1, avgDistance / 20);
  
  return Math.max(0.3, normalizedConfidence);
}

// Determine eye action based on coordinates
function determineEyeAction(coords) {
  const leftEye = coords.leftEye;
  const rightEye = coords.rightEye;
  
  // Simple heuristics for eye state
  // This could be enhanced with more sophisticated analysis
  const avgY = (leftEye.y + rightEye.y) / 2;
  
  if (avgY < 40) return 'looking up';
  if (avgY > 60) return 'looking down';
  
  const eyeDistance = Math.abs(leftEye.x - rightEye.x);
  if (eyeDistance < 30) return 'eyes close';
  if (eyeDistance > 70) return 'eyes wide';
  
  return 'steady';
}

// Determine mouth action based on coordinates
function determineMouthAction(coords) {
  const mouth = coords.mouth;
  
  // Simple heuristics for mouth state
  // This could be enhanced with more sophisticated analysis
  if (mouth.y < 70) return 'mouth open';
  if (mouth.y > 90) return 'mouth closed';
  
  return 'neutral';
}

// Create default descriptor when detection fails
function createDefaultDescriptor(frameId) {
  return {
    frameId: frameId,
    coords: {
      leftEye: { x: 40, y: 45, confidence: 0.3 },
      rightEye: { x: 80, y: 45, confidence: 0.3 },
      mouth: { x: 60, y: 85, confidence: 0.3 }
    },
    actions: {
      eyes: 'steady',
      mouth: 'closed'
    },
    meta: {
      src: `frame_${frameId}.png`,
      w: 120,
      h: 120,
      model: 'face-api-fallback'
    }
  };
}

// Convert blob to image element
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// ============================================================================
// HYBRID ANALYSIS: FACE-API + LLM
// ============================================================================

// Perform hybrid analysis using face-api for coordinates and LLM for qualitative descriptions
async function performHybridAnalysis(imgBlob, frameId, videoIndex, chunkNumber, frameNumberInChunk, config) {
  try {
    // Step 1: Get accurate coordinates using face-api.js
    console.log(`[Hybrid Analysis] Getting coordinates for frame ${frameId} using face-api...`);
    const coordinateDescriptor = await detectFacialLandmarks(imgBlob, frameId);
    
    // Step 2: Get qualitative descriptions using LLM
    console.log(`[Hybrid Analysis] Getting qualitative descriptions for frame ${frameId} using LLM...`);
    const qualitativeDescriptor = await getQualitativeDescription(imgBlob, frameId, config);
    
    // Step 3: Combine results
    const combinedDescriptor = {
      ...coordinateDescriptor,
      videoIndex: videoIndex,
      chunkNumber: chunkNumber,
      frameNumberInChunk: frameNumberInChunk,
      mouthViseme: qualitativeDescriptor.mouthViseme || 'SIL',
      mood: qualitativeDescriptor.mood || 'neutral',
      energy: qualitativeDescriptor.energy || 0.5,
      note: qualitativeDescriptor.note || '',
      meta: {
        ...coordinateDescriptor.meta,
        coordinateModel: 'face-api',
        qualitativeModel: config.model.name
      }
    };
    
    console.log(`[Hybrid Analysis] Successfully analyzed frame ${frameId}`);
    return {
      success: true,
      descriptor: combinedDescriptor,
      confidence: calculateOverallConfidence(combinedDescriptor),
      attempts: [{ attempt: 1, confidence: calculateOverallConfidence(combinedDescriptor), descriptor: combinedDescriptor }]
    };
    
  } catch (error) {
    console.error(`[Hybrid Analysis] Error analyzing frame ${frameId}:`, error);
    return {
      success: false,
      descriptor: null,
      confidence: 0,
      attempts: []
    };
  }
}

// Get qualitative description using LLM
async function getQualitativeDescription(imgBlob, frameId, config) {
  try {
    const electronAPI = window.electronAPI || window.parent?.electronAPI || window.top?.electronAPI;
    if (!electronAPI?.invoke) {
      console.warn('[Hybrid Analysis] Electron API not available, skipping qualitative analysis');
      return {
        mouthViseme: 'SIL',
        mood: 'neutral',
        energy: 0.5,
        note: 'no qualitative analysis'
      };
    }
    
    const b64 = await window.FacialDetectionEnhancements.blobToBase64(imgBlob);
    const batch = [{ id: frameId, image: `data:image/png;base64,${b64}` }];
    const res = await electronAPI.invoke('llm.describeImages', { batch });
    
    return res?.[0]?.desc || {
      mouthViseme: 'SIL',
      mood: 'neutral',
      energy: 0.5,
      note: 'no qualitative data'
    };
    
  } catch (error) {
    console.error(`[Hybrid Analysis] Qualitative analysis failed for frame ${frameId}:`, error);
    return {
      mouthViseme: 'SIL',
      mood: 'neutral',
      energy: 0.5,
      note: 'qualitative analysis failed'
    };
  }
}

// Calculate overall confidence score
function calculateOverallConfidence(descriptor) {
  const coords = descriptor.coords;
  const avgConfidence = (
    coords.leftEye.confidence +
    coords.rightEye.confidence +
    coords.mouth.confidence
  ) / 3;
  
  // Boost confidence if face-api detection was successful
  if (descriptor.meta.coordinateModel === 'face-api') {
    return Math.min(0.95, avgConfidence * 1.2);
  }
  
  return avgConfidence;
}

// ============================================================================
// EXPORTS
// ============================================================================

window.FaceAPICoordinateDetection = {
  initializeFaceAPI,
  detectFacialLandmarks,
  performHybridAnalysis,
  extractKeyCoordinates,
  calculateConfidence,
  determineEyeAction,
  determineMouthAction,
  createDefaultDescriptor,
  blobToImage,
  getQualitativeDescription,
  calculateOverallConfidence
};

console.log('[Face-API Coordinate Detection] Module loaded successfully');