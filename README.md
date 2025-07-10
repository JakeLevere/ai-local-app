# AI Local App

This Electron-based application uses the OpenAI API for certain features. Set the `OPENAI_API_KEY` environment variable with your API key before running the app. Without it, OpenAI features will fail to initialize.

## Project Files

`index.html` is the main renderer page loaded by Electron. A previous version of the interface has been kept for reference in `index-legacy.html`.

The old `style.js` script has been removed. Its functionality now lives across
`main.js`, `ipcHandlers.js`, and `renderer.js`.

## Local Images

The application looks for persona icons and other assets under `ai-local-data/Images`
inside your documents folder. You can store your own images in that directory and
they will be served at runtime. No images are required in the repository itself.
