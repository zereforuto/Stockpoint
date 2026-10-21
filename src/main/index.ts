import { app, BrowserWindow, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startBackupScheduler } from './backupScheduler'
import { openDatabase, type Db } from './db/database'
import { migrate } from './db/migrate'
import { seedDatabase } from './db/seed'
import { registerIpcHandlers } from './ipc/register'
import { dbPath, imagesDir } from './util/paths'

/** Lets the e2e suite (and power users) point the app at a different data dir. */
const testDataDir = process.env.STOCKPOINT_DATA_DIR
if (testDataDir) {
  app.setPath('userData', testDataDir)
}

// CI workspaces can have Electron's AppContainer ACL missing. This is only
// enabled by the isolated end-to-end test launcher, never in normal use.
if (process.env.STOCKPOINT_E2E === '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let db: Db | null = null
let stopBackupScheduler: (() => void) | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'StockPoint',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // The app is offline-first and must never open remote content.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function bootstrap(): void {
  mkdirSync(imagesDir(), { recursive: true })

  db = openDatabase(dbPath())
  const migration = migrate(db)
  if (migration.applied.length > 0) {
    console.log(`[db] applied migrations: ${migration.applied.join(', ')}`)
  }

  const seedDemo = process.env.STOCKPOINT_SEED_DEMO === '1' || (!testDataDir && process.env.STOCKPOINT_SEED_DEMO !== '0')
  const seed = seedDatabase(db, { demoData: seedDemo })
  if (seed.ownerCreated) {
    console.log('[db] seeded initial owner account (owner / owner123)')
  }

  registerIpcHandlers(db)
  stopBackupScheduler = startBackupScheduler(db)
  createWindow()
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    try {
      bootstrap()
    } catch (error) {
      console.error('[app] failed to start:', error)
      app.quit()
      return
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && db) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    stopBackupScheduler?.()
    try {
      db?.close()
    } catch (error) {
      console.error('[db] error while closing:', error)
    }
    db = null
  })
}
