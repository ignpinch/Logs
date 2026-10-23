# Life Log

A personal journal built with React, Vite, and JavaScript. Login has been removed. Journal entries are saved in this browser's `localStorage`, so they remain after refreshes and browser restarts on the same browser/device without needing an API server.

## Run locally

1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local URL Vite prints (usually `http://localhost:5173`).

## Saving and privacy

- Use **Save memory** after writing or dictating an entry. The app writes to browser storage before showing the success message.
- Open **My memories** to search, read, or delete saved entries.
- Export your entries to Excel for a backup.
- Data stays in the browser profile and does **not** automatically sync to other devices or browsers. Clearing site data, using private/incognito mode, or changing browser profiles can make entries unavailable. Export backups regularly.
- There is no login or access control. Anyone using the same browser profile can open this journal. Do not deploy it publicly with private entries unless access control is added.

## Voice transcription

Voice transcription uses the browser's Web Speech API and works best in Chrome or Edge. Browser support and microphone permissions vary; manual typing is always available.

## Deployment note

This version uses browser-local storage and does not require the Express server. Build the frontend with `npm run build` and deploy the generated `dist/` folder as a static site. Because data is stored in each browser, static hosting does not provide cross-device synchronization.
