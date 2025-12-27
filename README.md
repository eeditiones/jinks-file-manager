# Jinks File Manager

A web component for browsing and managing eXist-db collections via the Jinks API.

## Features

- Browse collections with grid view
- Upload, delete, rename, copy, and move files
- Keyboard shortcuts and context menu
- Image thumbnails
- Server-side pagination

## Installation

```bash
npm install
npm run build
```

Built files are in the `dist/` directory.

## Usage

```html
<jinks-file-manager
  api-base="/exist/apps/jinks"
  root="/db/apps/test"
></jinks-file-manager>

<script type="module" src="jinks-file-manager.js"></script>
```

### Attributes

- `api-base` (required): Base URL for the Jinks API
- `root` (required): Root collection path to start browsing from

## Development

```bash
npm run dev
```

Starts Vite dev server on `http://localhost:3000`.

## Keyboard Shortcuts

- `Ctrl+C` / `Cmd+C`: Copy selected item(s)
- `Ctrl+X` / `Cmd+X`: Cut selected item(s)
- `Ctrl+V` / `Cmd+V`: Paste item(s)
- `Delete`: Delete selected item(s)
- `F2`: Rename selected item

## License

This project is licensed under the GNU General Public License version 3.0 or later (GPL-3.0-or-later).

See the [LICENSE](LICENSE) file for details.
