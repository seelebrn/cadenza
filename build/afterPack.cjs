// electron-builder afterPack hook — macOS only.
//
// Why this exists: without a paid Apple Developer ID certificate,
// electron-builder does not re-sign the app, so the .app bundle keeps
// whatever ad-hoc code signature the *prebuilt* Electron binary already
// shipped with (baked in by the Electron project itself, before
// electron-builder ever touches it). That signature's identifier is the
// generic "Electron" — the same one every unsigned Electron app carries,
// unrelated to Cadenza's own bundle id (com.seelebrn.cadenza).
//
// A macOS `log show` capture (2026-09-10) showed syspolicyd evaluating
// and trashing Cadenza with `(id: Electron)` in its own log line, then
// AMFI reporting "has no CMS blob" / "Unrecoverable CT signature issue".
// The working theory: macOS's Gatekeeper exec-time policy (syspolicyd)
// treats that shared, generic "Electron" identity with more suspicion
// than an app-specific one — plausibly because it's the identity carried
// by a lot of unsigned Electron-based malware in the wild.
//
// This hook forces a fresh ad-hoc re-sign (`codesign --sign -`) of the
// whole packed .app *after* electron-builder assembles it but *before*
// it gets wrapped into a .dmg/.zip. Re-signing recomputes the signature
// against the app's actual, current Info.plist (CFBundleIdentifier
// com.seelebrn.cadenza), replacing the stale "Electron" identity with a
// Cadenza-specific one. Still not a trusted Developer ID signature —
// Gatekeeper will still show it as unidentified — but it stops the
// bundle from carrying the same generic signing identity as every other
// unsigned Electron app.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`[afterPack] Re-signing ${appPath} with a Cadenza-specific ad-hoc identity`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
