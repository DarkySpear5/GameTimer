import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'

export function NotesDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const [text, setText] = useState(profile?.notes ?? '')

  if (!profile) return null

  async function save(): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setNotes(name, text))
    onClose()
  }

  return (
    <Modal title={t('dlg_notes_title', { name: profile.name })} onClose={onClose} width="max-w-lg">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="w-full resize-none rounded bg-card px-3 py-2 text-sm text-text outline-none"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded bg-card px-4 py-1.5 text-sm text-text hover:bg-card/70">
          {t('btn_close')}
        </button>
        <button
          onClick={() => void save()}
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
        >
          {t('btn_save')}
        </button>
      </div>
    </Modal>
  )
}
