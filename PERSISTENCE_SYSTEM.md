# Display Persistence System

## Overview

Your Electron application now has a robust persistence system that saves and restores the state of programs running in your displays when you close and reopen the application.

## How It Works

### 1. **State Storage**
- **Location**: `C:\Users\jakek\Documents\ai-local-data\sharedData.json`
- **Format**: JSON file containing display states
- **Structure**:
  ```json
  {
    "openDisplays": {
      "display1": {
        "program": "browser",
        "url": "https://www.google.com"
      },
      "display2": {
        "program": "calendar"
      },
      "display3": {
        "program": "health"
      }
    }
  }
  ```

### 2. **Key Components**

#### **sharedDataService.js**
- Manages reading/writing the JSON persistence file
- Includes write queue to prevent concurrent write conflicts
- Provides methods: `getOpenDisplays()`, `setOpenDisplays()`

#### **main.js**
- Initializes the persistence service early in app startup
- Handles saving state on app quit (`before-quit` and `will-quit` events)
- Contains `gatherOpenDisplayState()` function to collect current browser states
- Restores displays after window creation

#### **ipcHandlers.js**
- Handles IPC communication for display management
- Saves state when programs are opened (`open-program` event)
- Sends restoration signal to renderer (`restore-open-displays`)

#### **renderer.js**
- Contains `restoreOpenDisplays()` function
- Processes restoration commands from main process
- Re-launches programs in correct displays with saved URLs

### 3. **Persistence Flow**

#### **Saving State (App Closing)**
1. User closes the application
2. `before-quit` event triggers
3. `gatherOpenDisplayState()` collects current program states
4. State is merged with existing data and saved to JSON file
5. `will-quit` event provides a backup save attempt

#### **Restoring State (App Opening)**
1. Application starts up
2. `sharedDataService` is initialized early
3. Main window is created
4. IPC handlers are initialized
5. `backend-ready` signal is sent to renderer
6. Renderer receives saved displays and calls `restoreOpenDisplays()`
7. Each saved program is reopened with its saved URL/state

### 4. **Supported Program Types**

#### **Browser**
- Saves current URL
- Restores to the exact page user was viewing
- Handles multiple browser tabs (future enhancement)

#### **Calendar**
- Saves program state
- Restores calendar application

#### **Health**
- Saves program state
- Restores health monitoring application

#### **Other Programs**
- Any program can be persisted by adding it to the display state
- Just needs to be registered in the program opening system

## Technical Details

### **Concurrency Protection**
The system includes a write queue in `sharedDataService.js` to prevent multiple processes from corrupting the JSON file:

```javascript
let isWriting = false;
let writeQueue = [];

async function processWriteQueue() {
    if (isWriting || writeQueue.length === 0) return;
    
    isWriting = true;
    const { data, resolve, reject } = writeQueue.shift();
    
    try {
        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
        resolve();
    } catch (error) {
        reject(error);
    } finally {
        isWriting = false;
        setTimeout(processWriteQueue, 10);
    }
}
```

### **Error Handling**
- JSON parsing errors are caught and logged
- File write errors don't crash the application
- Browser view cleanup is protected with try-catch blocks

### **Browser URL Persistence**
Special handling for browser programs to save the current URL:

```javascript
async function persistBrowserUrl(displayId, url) {
    if (!displayId || !url) return;
    try {
        const current = await sharedDataService.getOpenDisplays();
        const entry = current[displayId];
        if (entry && entry.program === 'browser') {
            current[displayId].url = url;
            await sharedDataService.setOpenDisplays(current);
        }
    } catch (err) {
        console.error('Error persisting browser URL:', err);
    }
}
```

## Testing the System

### **Manual Test**
1. Start the application: `npm start`
2. Open programs in different displays (e.g., browser, calendar, health)
3. Navigate to different websites in the browser
4. Close the application completely
5. Restart with `npm start`
6. Verify all programs reopen in their correct displays with saved states

### **Automated Test**
Run the test script:
```bash
node test-persistence.js
```

## Future Enhancements

1. **Program-Specific State**: Save more detailed state for each program type
2. **Window Position**: Save and restore window positions and sizes
3. **Tab State**: For browser, save all open tabs, not just active one
4. **User Preferences**: Allow users to disable persistence for certain programs
5. **State Versioning**: Handle upgrades gracefully with state migration

## Troubleshooting

### **Common Issues**

1. **JSON Corruption**: If you see JSON parsing errors, the file might be corrupted. Delete `sharedData.json` and restart.
2. **Programs Not Restoring**: Check the console for error messages and verify the program files exist.
3. **Browser Not Loading URL**: Ensure the saved URL is valid and accessible.

### **Debug Information**

The system logs detailed information to help with debugging:
- `>>> Restoring saved displays: {...}` shows what's being restored
- `RENDERER: Received 'load-display' for displayX` shows restoration progress
- Error messages indicate specific issues with file operations

## File Locations

- **Config File**: `C:\Users\jakek\Documents\ai-local-data\sharedData.json`
- **App Directory**: `C:\Users\jakek\Documents\ai-local-app\`
- **Test Script**: `C:\Users\jakek\Documents\ai-local-app\test-persistence.js`

---

**Status**: ✅ **IMPLEMENTED AND WORKING**

The persistence system is now fully functional. Programs in displays will remain persistent after closing and reopening the application, including browser URLs and program states.
