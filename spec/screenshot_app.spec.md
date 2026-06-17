# Screenshot App

A local, private workspace to capture, annotate, and manage screenshots non-destructively.

## Browser Extension (Capture & Crop)

The primary interface for capturing web pages and handing them off to the editor.

- **Capture Modes**: Supports visible viewport capture and full scrolling page capture.
- **Trigger Methods**: Initiated via extension toolbar icon click, right-click context menu, or keyboard shortcut (`Ctrl/Cmd+Shift+P`).
- **Interactive Cropping**: Displays a temporary cropping tab post-capture, allowing click-and-drag custom area selection.
- **Automatic Metadata**: Captures original webpage title and source URL to associate with the screenshot.
- **Seamless Handoff**: Automatically uploads the cropped image and metadata to the local server, then redirects the tab to the web editor.
- **Memory Maintenance**: Automatically purges stale or abandoned captures in the background.

## Web Editor (Annotate & Manage)

A robust interface for editing, marking up, and viewing saved screenshots.

- **Canvas Viewport**: 
  - Interactive canvas supporting panning and zoom controls (Zoom In/Out, Fit to Screen, Actual Size).
  - Supports manual import of external local images.
- **Annotation Tools**: Non-destructive overlay markup tools including Select, Rectangle, Oval, Line, Arrow, freehand Pencil, and interactive in-place Text boxes.
- **Style Controls**: Color picker supporting presets, custom hex selection, recent color history, and adjustable stroke widths.
- **Properties Inspector (Right Sidebar)**:
  - *Contextual Element Selection*: Fine-tune coordinates (X, Y, Width, Height), text content, stroke widths, and colors of selected drawings, or delete them.
  - *Default View (No Selection)*: Displays screenshot metadata (dimensions, annotation count) and a clickable link to the original webpage.
- **Screenshot Rail (Left Sidebar)**: Chronological history list showing screenshots with title, dimensions, capture age, and visual thumbnails. Enables rapid workspace switching.
- **Sharing & Exports**: Copy flattened annotated image directly to clipboard or download/save as a flat image.

## Backend Server & Storage

A lightweight local background manager for securely storing and retrieving screenshot workspaces.

- **Local Web Server**: Hosts the frontend interface and provides REST APIs for image uploads, metadata, and structured annotations.
- **Non-Destructive Storage**: Saves original raw captured images untouched on disk, storing annotations separately as structured data (JSON vector layouts) to allow ongoing, lossless editing.
- **Local Persistence**: 
  - Raw image files are saved to a dedicated local directory.
  - Metadata (titles, URLs, dimensions, filesizes, annotations) is persisted in a local database file.