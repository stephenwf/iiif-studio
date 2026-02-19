# IIIF Studio

A Vite + React UI playground for `@iiif/parser`.

## Features

- Upgrade IIIF JSON between:
  - Presentation 2 -> 3
  - Presentation 3 -> 4
  - Presentation 4 -> 3
  - Optional input/output diff view in the upgrade workspace
- Validate a Manifest/Collection from URL
- Pretty validation report with:
  - error/warning/info counts
  - issue list with paths and codes
  - inline JSON annotations mapped to validator paths

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

## Quality checks

```bash
pnpm lint
pnpm build
```

## Notes

- Conversion flows use public APIs from `@iiif/parser`.
- Validation uses the package's current Presentation 4 validator build (`dist/presentation-4/validator.js`) until a public validator export is available.
