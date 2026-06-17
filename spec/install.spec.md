# Install

A single self-contained binary plus a one-line installer.

## Binary

- One executable bundles the server, the web app, and the Chrome extension; nothing else is needed to run it.
- Runs from any location; serves the app at `http://localhost:8088` (fixed port).
- Data folder default: `~/panda` (macOS/Linux), `%LocalAppData%\Panda` (Windows). Overridable. A visible home folder keeps `<data>/extension` easy to reach in Chrome's "Load unpacked" picker.

## Installer (macOS / Linux)

Run via `curl -fsSL <url>/install.sh | sh`, or directly from the repo for a local install. The piped install downloads the matching build from the GitHub releases.

Flow:

1. Ask for the data folder (default `~/panda`).
2. Install the `panda` command so the user can run it from the terminal.
3. Copy the Chrome extension into `<data>/extension`.
   - Finish by printing clear steps to load it in Chrome (chrome://extensions → Developer mode → Load unpacked → `<data>/extension`).
4. Ask whether to auto-start panda at login and restart it after a crash.
5. Start panda in the background and open the web app in the browser.

- Prompts have non-interactive overrides so a piped install can run unattended.
- Re-running upgrades in place.

## Installer (Windows)

Run via `irm <url>/install.ps1 | iex`, or `.\install.ps1` from the repo. Same flow as macOS/Linux, with the Windows data-folder default `%LocalAppData%\Panda`.

## Extension

- Bundled in the binary and written to the data folder during install.
- The user still loads it into Chrome once via "Load unpacked".
