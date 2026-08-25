import { describe, expect, it } from 'vitest'
import * as watcherModule from './gameWatcher'

describe('makeSingleFlight', () => {
  it('does not overlap a slow process scan', async () => {
    const makeSingleFlight = (watcherModule as any).makeSingleFlight
    expect(makeSingleFlight).toBeTypeOf('function')

    let calls = 0
    let resolveGate!: () => void
    let gate = new Promise<void>((resolve) => {
      resolveGate = resolve
    })
    const run = makeSingleFlight(async () => {
      calls++
      await gate
    })

    const first = run()
    const second = run()
    expect(calls).toBe(1)

    resolveGate()
    await Promise.all([first, second])

    gate = new Promise<void>((resolve) => {
      resolveGate = resolve
    })
    const third = run()
    expect(calls).toBe(2)
    resolveGate()
    await third
  })
})
