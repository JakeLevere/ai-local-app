(async ()=> {
  // Test step 10: End to end small set analysis test
  // Requires a small prepared sample (frame blobs) in memory or via file system.

  const sampleFrameIds = [1, 2, 3, 4, 5];
  const videoIndex = 1;

  async function fakeLoadFrameBlob(id) {
    // Implement a way to load or mock blobs for test frames, e.g. via file reads or mock data
    // For actual test, replace below with your real blob loader or mock blob
    console.log(`Load blob for frame ${id}`);
    return null; // <-- Replace this with real blob
  }

  async function validateDescriptorFile(id) {
    const filename = `Video${videoIndex}_Frame${id}.json`;
    try {
      // Read file
      const filePath = `visualizer frames/descriptors/${filename}`;
      // Assuming readJSON or similar file read helper is available
      const desc = await window.readJSON(filePath).catch(()=>null);
      if(!desc) {
        console.error(`Descriptor file missing: ${filename}`);
        return false;
      }
      console.log(`Loaded descriptor ${filename}:`, desc);

      // Check coords
      for(let p of ['leftEye','rightEye','mouth']) {
        if(!desc.coords || !desc.coords[p]) {
          console.error(`Coords missing for ${p} in ${filename}`);
          return false;
        }
        const c = desc.coords[p];
        if(c.x<0 || c.x>119 || c.y<0 || c.y>119) {
          console.error(`Coords out of range ${p} in ${filename}`);
          return false;
        }
      }

      // Check actions
      if(!desc.actions || typeof desc.actions.eyes !== 'string' || desc.actions.eyes.trim()==='') {
        console.error(`Invalid or empty eyes action in ${filename}`);
        return false;
      }
      if(!desc.actions || typeof desc.actions.mouth !== 'string' || desc.actions.mouth.trim()==='') {
        console.error(`Invalid or empty mouth action in ${filename}`);
        return false;
      }

      // Validate schema
      const errors = validateDescriptor(desc);
      if(errors.length) {
        console.error(`Schema validation errors in ${filename}:`, errors);
        return false;
      }

      return true;
    } catch(e) {
      console.error(`Error reading descriptor ${filename}:`, e);
      return false;
    }
  }

  async function runTest(){
    console.log('Starting end-to-end test for frames:', sampleFrameIds);

    // Run analysis on sample frames
    try {
      // This depends on existing APIs and how you load frames in your environment
      // Below is pseudocode placeholder to invoke analysis
      await startAnalysis(); // Ensure it uses selected video = 1 with these frames
      
      // Verify saved descriptors
      for(const id of sampleFrameIds){
        const ok = await validateDescriptorFile(id);
        if(!ok) {
          console.error(`Test failed for frame ${id}`);
        } else {
          console.log(`Test passed for frame ${id}`);
        }
      }
    } catch(e) {
      console.error('Error running end-to-end test:', e);
    }
    console.log('End-to-end test complete.');
  }

  await runTest();

})();
