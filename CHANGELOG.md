# Changelog

## 1.0.3 — 2026-10-13

- Keep exported heading and body aliases distinct when different font names normalize to the same CSS token.
- Reserve shelf capacity while fonts load so concurrent file selections cannot exceed the six-font limit.
- Expand continuous integration to Node.js 20, 22, and 24.

## 1.0.2 — 2026-10-11

- Complete the standard MIT license text, restoring the full warranty and liability disclaimer.

## 1.0.1 — 2026-10-10

- Add a project screenshot to the README and downloadable release.

## 1.0.0 — 2026-10-10

- Initial release: local font shelf, live heading/body comparison, system font examples, adjustable specimen, and CSS theme export.
- Added safe CSS generation, a loopback-only development server, and tests for formats, Unicode family names, escaping, path validation, determinism, and settings limits.