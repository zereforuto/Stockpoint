# StockPoint

An offline-first desktop inventory and point-of-sale app for small retail shops, including sari-sari stores, groceries, and boutiques.

StockPoint keeps products, sales, stock movements, reports, and backups on the local device. It does not require an internet connection to operate.

## Features

- Local, role-based authentication for owners and cashiers
- Product and category management with SKU, barcode, pricing, stock, reorder level, optional images, and CSV import/export
- Keyboard-wedge barcode scanning and product search by name, SKU, or barcode
- POS cart with quantity changes, percentage/fixed discounts, tax, cash/card/e-wallet payments, change calculation, and printable receipts
- Transactional stock deduction on sale, stock restoration when a sale is voided, and a complete stock-movement audit trail
- Sales history with filtering, receipt viewing/printing, and owner-only voids with a required reason
- Dashboard, sales trends, top products, profit, stock valuation, Recharts visualizations, and CSV/PDF exports
- Configurable shop, tax, receipt, and automatic daily-backup settings, plus manual database backup and restore
- SQLite database access contained in Electron's main process behind typed, validated IPC

## Tech stack

Electron, React, TypeScript, Vite, Tailwind CSS, SQLite (`better-sqlite3`), Zustand, Zod, Recharts, Vitest, Playwright, and electron-builder.

## Requirements

- Node.js 22.12 or later (Node 24 is supported)
- npm

## Getting started

```powershell
git clone <your-repository-url>
cd Stockpoint
npm install
npm.cmd run dev
```

On the first development run, sign in with:

```text
Username: owner
Password: owner123
```

The app requires you to change this starter password before continuing.

## Commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start the development app. |
| `npm.cmd run build` | Type-check and create a production build in `out/`. |
| `npm.cmd test` | Run the Vitest unit suite. |
| `npm.cmd run test:coverage` | Run tests with coverage reporting. |
| `npx.cmd eslint .` | Run linting. |
| `npm.cmd run test:e2e` | Build and run the Playwright Electron smoke test. |
| `npm.cmd run pack` | Build an unpacked Windows app in `release/win-unpacked/`. |
| `npm.cmd run dist:win` | Build a Windows installer. |
| `npm.cmd run dist:mac` | Build a macOS package. |
| `npm.cmd run dist:linux` | Build a Linux package. |

On macOS/Linux, use `npm` rather than `npm.cmd`.

## Packaging

Create an unpacked Windows build with:

```powershell
npm.cmd run pack
.\release\win-unpacked\StockPoint.exe
```

`electron-builder.yml` deliberately sets `npmRebuild: false`, which keeps the compatible `better-sqlite3` binary from being unnecessarily rebuilt during packaging.

## Data and backups

The database, product images, and backups are stored under Electron's per-user application-data directory. The app can export a copy of the SQLite database, validate it before restoring, and makes a safety copy before a restore. Automatic backups are checked hourly and created at most once every 24 hours when enabled and pointed at a backup folder.

## Architecture

```text
React renderer
    │ typed IPC through preload
Electron main process
    │ services and repositories
SQLite database
```

- `src/shared/` defines shared types, schemas, money/timestamp utilities, and the IPC contract.
- `src/main/` owns SQLite, migrations, sessions, services, repositories, backup scheduling, and IPC handlers.
- `src/preload/` exposes only `window.api.invoke`.
- `src/renderer/` contains the React user interface and Zustand stores.

Money is stored and calculated as integer centavos/minor units. Sales and voids run in immediate SQLite transactions, preventing stock and sale records from getting out of sync.

## Quality checks

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd eslint .
npm.cmd run build
```

The unit suite covers pricing/discount/tax math, stock changes, rapid-sale stock protection, voids, reports, authentication, catalog operations, schemas, and backups.

## License

MIT. See [package.json](package.json) for the project license declaration.
