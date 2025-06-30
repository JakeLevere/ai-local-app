// programs/calendarBridge.js
// Small helper used by Time Block to communicate with the main process
window.calendarBridge = {
  load: async () => window.electronAPI.invoke('load-timeblock-data'),
  save: async (events) => window.electronAPI.invoke('save-timeblock-data', events)
};

