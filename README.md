# AI Local App

This Electron-based application uses the OpenAI API for certain features. Set the `OPENAI_API_KEY` environment variable with your API key before running the app. Without it, OpenAI features will fail to initialize.


The built-in web server reads the `PORT` environment variable to determine which port to listen on. If `PORT` is not set, the server defaults to `3000`.

## Prerequisites

- **Node.js** v18 or newer with npm installed.
- Project dependencies listed in `package.json` (install via `npm install`).

## Running the Application

1. Install Node.js and clone this repository.
2. Run `npm install` to fetch dependencies.
3. Set required environment variables:
   - `OPENAI_API_KEY` – your OpenAI API key.
   - `PORT` – optional. Overrides the default `3000` port for the local server.
4. Start the desktop app with `npm start`. This launches Electron using `main.js`.

## Project Files

`main.js` is the Electron entry point. It starts a local Express server and then loads `index.html` from the project root.
An earlier version of the interface has been removed and is no longer included.

## Adding Programs

Place each program under `programs/<name>` with its own `index.html` or `<name>.html` file alongside any assets.
Use the chat command `open <name>` to load the program automatically.
If the folder or file is missing, the interface will show "No program '<name>' found.".


## User Data and Images

- All persistent application data is stored under `ai-local-data` inside your system's **Documents** folder. Within this directory you will find:
- `Personas` – persona data and logs.
- `Decks` – flashcard decks.
- `Images` – persona icons and other assets.
- `Calendar` – calendar events and history (stored in `<Documents>/ai-local-data/Calendar`).


## Local Images


The application looks for persona icons and other assets under `ai-local-data/Images`
inside your documents folder. You can store your own images in that directory and
they will be served at runtime. No images are required in the repository itself.

## Packaging

Package the application using [electron-builder](https://www.electron.build/).
After installing dependencies, run:

```bash
npm run build
```

The build output will be placed in the `dist` directory.

## Browser Extensions

The built-in browser supports installing Chrome extensions. Click the **Ext** button
and choose a `.zip` or `.crx` file to install a new extension. If the archive contains a
single folder, the installer detects this and loads the extension correctly. If you
select a folder, the installer now searches inside for `.zip` or `.crx` archives before
falling back to loading the folder directly. Right click the **Ext** button to access
options for already installed extensions.

## License

This project is licensed under the [MIT License](LICENSE).

