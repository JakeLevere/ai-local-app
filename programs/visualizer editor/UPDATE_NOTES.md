# Visualizer Editor Update - Unified Chunk System

## Overview
The visualizer editor has been updated to use a unified chunk system that properly tracks multiple videos with video-specific prefixes for file naming.

## Key Changes

### 1. File Naming Convention
- Frames are now named with video prefix: `{videoIndex}_{frameNumber}.png`
- Example: `1_0001.png` for video 1 frame 1, `2_0045.png` for video 2 frame 45
- Each video maintains its own frame numbering starting from 1

### 2. Unified Chunks File
- Single `chunks.json` file that accumulates all video data
- Each chunk entry includes:
  - `videoIndex`: Which video this chunk belongs to
  - `videoName`: Original video filename
  - `chunkNumber`: Global chunk number across all videos
  - `frames`: Array of frame filenames with video prefix
  - `timestamp`: When the chunk was created

### 3. Directory Structure
```
Personas/
  [PersonaName]/
    visualizer frames/
      raw/
        1_0001.png     (video 1, frame 1)
        1_0002.png     (video 1, frame 2)
        ...
        2_0001.png     (video 2, frame 1)
        2_0002.png     (video 2, frame 2)
        ...
      proc120/
        (same naming pattern)
      descriptors/
        1_0001.json
        1_0002.json
        ...
      chunks.json      (unified chunks file for all videos)
```

### 4. Video Tracking
- Each persona tracks the current video index
- Video index increments when processing a new video
- Video index is stored in localStorage per persona

### 5. Benefits
- No data overwriting between videos
- Clear association between frames and source videos
- Easy to identify which frames belong to which video
- Single chunks file makes it easy to process all data together
- Maintains compatibility with existing review/analysis tools

## Implementation Status
- [x] Video index tracking per persona
- [x] Video-specific frame naming
- [x] Unified chunks.json structure
- [x] Directory structure support
- [x] Frame extraction with new naming
- [x] Downscaling with new naming
- [x] Descriptor saving with new naming
- [x] Review panel compatibility

## Testing Notes
1. Select a persona
2. Load first video and run ingest
3. Check that frames are saved as 1_0001.png, 1_0002.png, etc.
4. Load second video and run ingest  
5. Check that frames are saved as 2_0001.png, 2_0002.png, etc.
6. Verify chunks.json contains both videos' data with proper video indices
