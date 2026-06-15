# Panda Screenshot

Panda Screenshot is a local screenshot capture and annotation app.

## Run

```bash
npm --prefix web install
npm --prefix web run build
go run ./cmd/panda -addr :8086
```

Open http://localhost:8086/screenshot.

## Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Load unpacked extension from `extension/`.
4. Keep the Panda server running on `http://localhost:8086`.
5. Click the extension icon on any normal page. It captures the full page, opens a crop tab before the source tab, uploads the crop, then replaces that tab with the web editor.

Temporary full-page captures live in Chrome extension session storage. They are removed after upload, when the crop tab is closed, and after 30 minutes.

## Keyboard

- `V` select
- `R` rectangle
- `O` oval
- `L` line
- `T` text
- `Enter` insert a newline while typing text
- `Esc` finish typing text
- `Delete` remove selection
- `C` copy annotated image
