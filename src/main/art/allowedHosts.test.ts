import { describe, expect, it } from 'vitest'
import * as artHosts from './allowedHosts'

const { isAllowedArtUrl } = artHosts

describe('isAllowedArtUrl', () => {
  it('accepts an exact HTTPS artwork CDN host', () => {
    expect(isAllowedArtUrl('https://cdn.cloudflare.steamstatic.com/steam/apps/10/header.jpg')).toBe(true)
  })

  it('rejects credentials even when the hostname is allowlisted', () => {
    expect(isAllowedArtUrl('https://attacker@cdn.cloudflare.steamstatic.com/steam/apps/10/header.jpg')).toBe(false)
  })

  it('rejects a non-default HTTPS port', () => {
    expect(isAllowedArtUrl('https://cdn.cloudflare.steamstatic.com:8443/steam/apps/10/header.jpg')).toBe(false)
  })
})

describe('art response limits', () => {
  it('stops reading a chunked response once it exceeds the image byte budget', async () => {
    const readAllowedArtResponse = (artHosts as any).readAllowedArtResponse
    expect(readAllowedArtResponse).toBeTypeOf('function')

    const oversized = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8 * 1024 * 1024))
          controller.enqueue(new Uint8Array(8 * 1024 * 1024))
          controller.close()
        }
      })
    )

    await expect(readAllowedArtResponse(oversized)).resolves.toBeNull()
  })
})
