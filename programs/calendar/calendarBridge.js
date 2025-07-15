// programs/calendarBridge.js
// Small helper used by Time Block to communicate with the main process
window.calendarBridge = {
  load: async () => window.electronAPI.loadState(),
  save: async (state) => window.electronAPI.saveState(state),
  saveHistory: async (markdown) => window.electronAPI.saveHistory(markdown)
};

