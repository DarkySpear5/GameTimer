import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

/** N: a per-game gallery of screenshots captured via the M2 hotkey — grid of thumbnails, click one to open it in the OS's default viewer. */
export function ScreenshotsDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [files, setFiles] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void window.api.screenshots.list(name).then((f) => {
      setFiles(f)
      setLoaded(true)
    })
  }, [name])

  return (
    <Modal title={t('dlg_screenshots_title', { name })} onClose={onClose} width="max-w-2xl">
      {loaded && files.length === 0 && (
        <div className="py-8 text-center text-sm text-subtext">{t('screenshots_empty')}</div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {files.map((filePath) => (
          <button
            key={filePath}
            onClick={() => void window.api.screenshots.open(name, basename(filePath))}
            className="aspect-video overflow-hidden rounded bg-card hover:opacity-80"
          >
            <img
              src={`gt-asset://screenshots/${encodeURIComponent(name)}/${encodeURIComponent(basename(filePath))}`}
              alt=""
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </Modal>
  )
}
