import { useEffect, useState } from 'react'
import { LegacyImportPrompt } from './LegacyImportPrompt'
import { InstalledGamesDialog } from './InstalledGamesDialog'

/**
 * The first-run offers, in order, one at a time.
 *
 * Sequenced deliberately rather than each component deciding for itself:
 *
 *   1. Import your v1 library — about data you already have.
 *   2. Add the games installed on this PC — about data Gamut can find.
 *
 * Two modals appearing together on a first launch is the kind of thing that
 * makes an app feel like it is interrogating you, and the v1 offer is the one
 * that must not be missed: someone upgrading who never sees it concludes their
 * library is gone.
 */
export function FirstRunPrompts(): React.JSX.Element | null {
  const [legacyDone, setLegacyDone] = useState(false)
  const [showInstalled, setShowInstalled] = useState(false)

  useEffect(() => {
    if (!legacyDone) return
    void (async () => {
      if (await window.api.detect.installedScanPending()) setShowInstalled(true)
    })()
  }, [legacyDone])

  return (
    <>
      <LegacyImportPrompt onResolved={() => setLegacyDone(true)} />
      {showInstalled && <InstalledGamesDialog firstRun onClose={() => setShowInstalled(false)} />}
    </>
  )
}
