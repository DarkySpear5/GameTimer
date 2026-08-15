import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'

/**
 * Fires once per timer start (Play, or gameWatcher auto-start) for a game
 * that has ≥1 sub-category — see timerStore's shouldPromptFor. Answering
 * late is fine and expected: the timer never waits on this (see the design
 * spec), so "None" and "closed without answering" are the same outcome —
 * the session's time already landed in the main total the normal way either
 * way, this only decides whether it ALSO gets credited to one bucket.
 */
export function SubCategoryPromptDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const [busy, setBusy] = useState(false)

  if (!profile) return null

  async function choose(categoryId: string | null): Promise<void> {
    if (categoryId === null) {
      onClose()
      return
    }
    setBusy(true)
    try {
      useProfilesStore
        .getState()
        .upsert(await window.api.profiles.assignSubCategorySession(name, categoryId))
    } finally {
      onClose()
    }
  }

  // No name is collected up front — window.prompt() does not work in
  // Electron. Creates with a placeholder, immediately credits this session
  // to it, and it's ready to rename inline from the game's own page
  // afterward — same reasoning as LibraryDetail.tsx's addSubCategory.
  async function createAndChoose(): Promise<void> {
    setBusy(true)
    try {
      const updated = await window.api.profiles.createSubCategory(name)
      useProfilesStore.getState().upsert(updated)
      const created = updated.subCategories[updated.subCategories.length - 1]
      await choose(created.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('subcat_prompt_title', { name })} onClose={() => void choose(null)}>
      <div className="flex flex-col gap-1.5">
        <button
          disabled={busy}
          onClick={() => void choose(null)}
          className="rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel disabled:opacity-50"
        >
          {t('subcat_prompt_none')}
        </button>
        {profile.subCategories.map((c) => (
          <button
            key={c.id}
            disabled={busy}
            onClick={() => void choose(c.id)}
            className="rounded-lg bg-card px-3 py-2 text-left text-sm text-text hover:bg-panel disabled:opacity-50"
          >
            {c.name}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => void createAndChoose()}
          className="rounded-lg bg-card px-3 py-2 text-left text-sm text-accent hover:bg-panel disabled:opacity-50"
        >
          {t('subcat_new')}
        </button>
      </div>
    </Modal>
  )
}
