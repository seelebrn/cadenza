import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import JSZip from 'jszip'
import { buildQdpx, parseQdpx } from '../shared/refiQda'
import { buildXlsxParts } from '../shared/spreadsheet'
import type { Sheet } from '../shared/spreadsheet'
import { normalizeProjectData } from '../shared/normalizeProject'
import type { ProjectData, SerializedAssets } from '../shared/types'
import type { ReportExportFormat } from '../shared/api'
import { importDocumentDialog } from './import'
import { backupFilePath, listBackups } from './backups'
import { createEmptyProject, readProjectFile, writeProjectFile } from './projectFile'
import { addRecentProject, getRecentProjects, removeRecentProject } from './recentProjects'
import { renderReportToDocx } from './export/docxRenderer'
import { renderHtmlToPdf } from './export/pdfRenderer'
import { renderReportToHtml } from '../shared/reportModel'
import type { Report } from '../shared/reportModel'

const isDev = !app.isPackaged

const PROJECT_FILE_FILTERS = [{ name: 'Cadenza Project', extensions: ['qdaproj'] }]
const QDPX_FILE_FILTERS = [{ name: 'REFI-QDA Project (.qdpx)', extensions: ['qdpx'] }]

/** Bundled sample project shown from ProjectHome's "Explore an example"
 * button. Shipped via electron-builder's `extraResources` (see
 * package.json), landing at <resources>/sample-projects in a packaged
 * build; in dev mode the equivalent files live in the repo itself. */
function sampleProjectPath(): string {
  const base = isDev ? join(app.getAppPath(), 'resources') : process.resourcesPath
  return join(base, 'sample-projects', 'example.qdaproj')
}

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

  ipcMain.handle('project:export-qdpx', async (_event, data: ProjectData) => {
    const result = await dialog.showSaveDialog({
      title: 'Export as REFI-QDA project',
      defaultPath: `${data.name}.qdpx`,
      filters: QDPX_FILE_FILTERS
    })
    if (result.canceled || !result.filePath) return null
    const bundle = buildQdpx(data, `Cadenza ${app.getVersion()}`)
    const zip = new JSZip()
    zip.file('project.qde', bundle.qde)
    for (const [path, text] of Object.entries(bundle.sources)) zip.file(path, text)
    await writeFile(result.filePath, await zip.generateAsync({ type: 'nodebuffer' }))
    return result.filePath
  })

  ipcMain.handle('project:import-qdpx', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import a REFI-QDA project',
      properties: ['openFile'],
      filters: QDPX_FILE_FILTERS
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const zip = await JSZip.loadAsync(await readFile(result.filePaths[0]))
    const qdeEntry = zip.file('project.qde') ?? zip.file(/(^|\/)project\.qde$/i)[0]
    if (!qdeEntry) throw new Error('Not a REFI-QDA file: no project.qde inside the archive')
    const qde = await qdeEntry.async('string')
    // Source texts are read up front (the parser is synchronous), keyed by
    // their path inside the zip, case-insensitively — QualCoder writes the
    // folder as "Sources/", others as "sources/" — and a tool that nests
    // everything in a top folder is tolerated by also matching on the
    // trailing path.
    const sources = new Map<string, string>()
    for (const file of zip.file(/\.txt$/i)) sources.set(file.name.toLowerCase(), await file.async('string'))
    const readSource = (zipPath: string): string | undefined => {
      const wanted = zipPath.toLowerCase()
      if (sources.has(wanted)) return sources.get(wanted)
      for (const [name, text] of sources) if (name.endsWith(`/${wanted}`)) return text
      return undefined
    }
    const { data, report } = parseQdpx(qde, readSource)
    return { data: normalizeProjectData(data), report }
  })

  ipcMain.handle('project:get-recent', () => getRecentProjects())

  ipcMain.handle('project:remove-recent', (_event, filePath: string) =>
    removeRecentProject(filePath)
  )

  ipcMain.handle('project:open-example', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save the example project as…',
      defaultPath: 'Cadenza — Example.qdaproj',
      filters: PROJECT_FILE_FILTERS
    })
    if (result.canceled || !result.filePath) return null
    // The bundled file is copied to a path the user owns and can edit
    // freely, rather than opened in place — the shipped copy stays a
    // pristine template for next time.
    await copyFile(sampleProjectPath(), result.filePath)
    const { data, assets } = await readProjectFile(result.filePath)
    await addRecentProject({
      filePath: result.filePath,
      name: data.name,
      lastOpenedAt: new Date().toISOString()
    })
    return { data, assets, filePath: result.filePath }
  })

  ipcMain.handle('project:list-backups', (_event, projectId: string) => listBackups(projectId))

  ipcMain.handle('project:restore-backup', async (_event, projectId: string, fileName: string) => {
    const { data, assets } = await readProjectFile(backupFilePath(projectId, fileName))
    // filePath deliberately null: a restored backup isn't tied to any real
    // save location of its own (only the file it was recovered *from* is,
    // which shouldn't be silently overwritten) — the next save has to go
    // through Save As, same as a brand new project.
    return { data, assets, filePath: null }
  })
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

  ipcMain.handle('export:spreadsheet', async (_event, sheets: Sheet[], suggestedName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `${suggestedName}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return null
    const zip = new JSZip()
    for (const [path, xml] of Object.entries(buildXlsxParts(sheets))) zip.file(path, xml)
    await writeFile(result.filePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
    return result.filePath
  })
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
