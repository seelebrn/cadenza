import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import type { ProjectData } from '../shared/types'
import { createEmptyProject, readProjectFile, writeProjectFile } from './projectFile'
import { addRecentProject, getRecentProjects } from './recentProjects'

const isDev = !app.isPackaged

const PROJECT_FILE_FILTERS = [{ name: 'Cadenza Project', extensions: ['qdaproj'] }]

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Open external links in the OS browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerProjectHandlers(): void {
  ipcMain.handle('project:create', (_event, name: string) => createEmptyProject(name))

  ipcMain.handle('project:open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: PROJECT_FILE_FILTERS
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const { data } = await readProjectFile(filePath)
    await addRecentProject({ filePath, name: data.name, lastOpenedAt: new Date().toISOString() })
    return { data, filePath }
  })

  ipcMain.handle('project:open-path', async (_event, filePath: string) => {
    const { data } = await readProjectFile(filePath)
    await addRecentProject({ filePath, name: data.name, lastOpenedAt: new Date().toISOString() })
    return { data, filePath }
  })

  async function saveAs(data: ProjectData): Promise<{ filePath: string } | null> {
    const result = await dialog.showSaveDialog({
      defaultPath: `${data.name}.qdaproj`,
      filters: PROJECT_FILE_FILTERS
    })
    if (result.canceled || !result.filePath) return null
    await writeProjectFile(result.filePath, data)
    await addRecentProject({
      filePath: result.filePath,
      name: data.name,
      lastOpenedAt: new Date().toISOString()
    })
    return { filePath: result.filePath }
  }

  ipcMain.handle(
    'project:save',
    async (_event, data: ProjectData, filePath: string | null) => {
      if (!filePath) return saveAs(data)
      await writeProjectFile(filePath, data)
      await addRecentProject({ filePath, name: data.name, lastOpenedAt: new Date().toISOString() })
      return { filePath }
    }
  )

  ipcMain.handle('project:save-as', (_event, data: ProjectData) => saveAs(data))

  ipcMain.handle('project:get-recent', () => getRecentProjects())
}

app.whenReady().then(() => {
  registerProjectHandlers()
  createWindow()

  app.on('activate', () => {
    // macOS convention: re-create a window when the dock icon is clicked
    // and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // macOS convention: keep the app running in the dock until Cmd+Q.
  if (process.platform !== 'darwin') app.quit()
})
