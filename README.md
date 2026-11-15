# AniCut 2D

Offline-first 2D animation and video editor built with React, TypeScript, HTML5 Canvas, IndexedDB, Web Audio API, WebCodecs (`mp4-muxer` / `webm-muxer`), locally bundled `ffmpeg.wasm`, and `vite-plugin-pwa`.

## Local Development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (Free Hosting + Offline PWA + Blogger Embed)

1. Push this repository to GitHub on branch `main` (or `master`).
2. In your GitHub repository, go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. The included `.github/workflows/deploy-pages.yml` workflow will automatically build and publish the app to:
   `https://<your-username>.github.io/<repo-name>/`
4. You can also embed that GitHub Pages URL inside your Blogger Page or Blogger Theme XML `<iframe>`.

## Build Android `.apk` Automatically via GitHub Actions

1. After pushing to GitHub, open the **Actions** tab in your repository.
2. Select **Build Android APK (Capacitor)** (runs on push or via **Run workflow**).
3. Once completed, download **`AniCut-2D-Android-APK`** from the **Artifacts** section and install `app-debug.apk` on your Android device.
