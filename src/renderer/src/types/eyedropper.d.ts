export {}

interface EyeDropperOpenResult {
  sRGBHex: string
}

interface EyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperOpenResult>
}

declare global {
  interface Window {
    EyeDropper?: { new (): EyeDropper }
  }
}
