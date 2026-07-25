import { create } from 'zustand'

interface ToastItem {
  id: number
  message: string
  kind: 'error' | 'info'
}

interface ToastState {
  items: ToastItem[]
}

let nextId = 1
export const useToastStore = create<ToastState>(() => ({ items: [] }))

function push(message: string, kind: ToastItem['kind']): void {
  const id = nextId++
  useToastStore.setState((s) => ({ items: [...s.items, { id, message, kind }] }))
  setTimeout(() => {
    useToastStore.setState((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  }, 4000)
}

export const toast = {
  error: (message: string) => push(message, 'error'),
  info: (message: string) => push(message, 'info')
}

export function ToastHost(): React.JSX.Element {
  const items = useToastStore((s) => s.items)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-lg px-4 py-2 text-sm shadow-lg ${
            item.kind === 'error' ? 'bg-red text-bg' : 'bg-card text-text'
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
