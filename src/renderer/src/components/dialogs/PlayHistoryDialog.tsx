import { useState } from 'react'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimeFormat } from '../../state/useTimeFormat'
import { PlayHistoryChart } from '../charts/PlayHistoryChart'
import { selectPlayHistoryBuckets, type PlayHistoryRange } from '../charts/playHistoryBuckets'
import { emptyPlayHistory } from '@shared/playHistory'

const RANGES: { key: PlayHistoryRange; label: string }[] = [
  { key: 'thirtyDays', label: 'Month' },
  { key: 'fiftyTwoWeeks', label: 'Year' },
  { key: 'allTime', label: 'All Time' }
]

export function PlayHistoryDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element | null {
  const profile = useProfilesStore((s) => s.profiles[name])
  const timeFormat = useTimeFormat()
  const [range, setRange] = useState<PlayHistoryRange>('thirtyDays')
  if (!profile) return null
  return (
    <Modal title={`Play history — ${profile.name}`} onClose={onClose} width="max-w-4xl">
      <div className="mb-4 flex gap-2">
        {RANGES.map((item) => <button key={item.key} onClick={() => setRange(item.key)} className={`rounded px-3 py-1.5 text-sm ${range === item.key ? 'bg-accent text-bg' : 'bg-card text-text'}`}>{item.label}</button>)}
      </div>
      <PlayHistoryChart title="Hours played" selection={selectPlayHistoryBuckets(profile.playHistory ?? emptyPlayHistory(), range)} timeFormat={timeFormat} variant="line" zoomable />
    </Modal>
  )
}
