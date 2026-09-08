import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { ProjectData, SerializedAssets } from '../shared/types'
import type { ReportExportFormat } from '../shared/api'
import { importDocumentDialog } from './import'
import { createEmptyProject, readProjectFile, writeProjectFile } from './projectFile'
import { addRecentProject, getRecentProjects } from './recentProjects'
import { renderReportToDocx } from './export/docxRenderer'
import { renderHtmlToPdf } from './export/pdfRenderer'
import { renderReportToHtml } from '../shared/reportModel'
import type { Report } from '../shared/reportModel'

const isDev = !app.isPackaged

const PROJECT_FILE_FILTERS = [{ name: 'Cadenza Project', extensions: ['qdaproj'] }]

const REPORT_FILE_FILTERS: Record<ReportExportFormat, { name: string; extensions: string[] }[]> = {
  html: [{ name: 'HTML', extensions: ['html'] }],
  docx: [{ name: 'Word Document', extensions: ['docx'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }]
}

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
    const { data, assets } = await readProjectFile(filePath)
    await addRecentProject({ filePath, name: data.name, lastOpenedAt: new Date().toISOString() })
    return { data, assets, filePath }
  })

  ipcMain.handle('project:open-path', async (_event, filePath: string) => {
    const { data, assets } = await readProjectFile(filePath)
    await addRecentProject({ filePath, name: data.name, lastOpenedAt: new Date().toISOString() })
    return { data, assets, filePath }
  })

  async function saveAs(
    data: ProjectData,
    assets: SerializedAssets
  ): Promise<{ filePath: string } | null> {
    const result = await dialog.showSaveDialog({
      defaultPath: `${data.name}.qdaproj`,
      filters: PROJECT_FILE_FILTERS
    })
    if (result.canceled || !result.filePath) return null
    await writeProjectFile(result.filePath, data, assets)
    await addRecentProject({
      filePath: result.filePath,
      name: data.name,
      lastOpenedAt: new Date().toISOString()
    })
    return { filePath: result.filePath }
  }

  ipcMain.handle(
    'project:save',
    async (_event, data: ProjectData, assets: SerializedAssets, filePath: string | null) => {
      if (!filePath) return saveAs(data, assets)
      await writeProjectFile(filePath, data, assets)
      await addRecentProject({ filePath, name: data.name, lastOpenedAt: new Date().toISOString() })
      return { filePath }
    }
  )

  ipcMain.handle('project:save-as', (_event, data: ProjectData, assets: SerializedAssets) =>
    saveAs(data, assets)
  )

  ipcMain.handle('project:get-recent', () => getRecentProjects())
}

function registerDocumentHandlers(): void {
  ipcMain.handle('document:import-dialog', () => importDocumentDialog())
}

function registerExportHandlers(): void {
  ipcMain.handle(
    'export:report',
    async (_event, report: Report, format: ReportExportFormat, suggestedName: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: `${suggestedName}.${format}`,
        filters: REPORT_FILE_FILTERS[format]
      })
      if (result.canceled || !result.filePath) return null

      if (format === 'html') {
        await writeFile(result.filePath, renderReportToHtml(report), 'utf8')
      } else if (format === 'docx') {
        await writeFile(result.filePath, await renderReportToDocx(report))
      } else {
        await writeFile(result.filePath, await renderHtmlToPdf(renderReportToHtml(report)))
      }
      return result.filePath
    }
  )

  ipcMain.handle(
    'export:board-pdf',
    async (_event, html: string, widthPx: number, heightPx: number, suggestedName: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: `${suggestedName}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return null
      const pdf = await renderHtmlToPdf(html, { widthPx, heightPx })
      await writeFile(result.filePath, pdf)
      return result.filePath
    }
  )
}

app.whenReady().then(() => {
  registerProjectHandlers()
  registerDocumentHandlers()
  registerExportHandlers()
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
