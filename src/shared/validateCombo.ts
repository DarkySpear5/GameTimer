/**
 * Combo validation for punch-list M2: 2 keys need a modifier first
 * (Shift/Ctrl/Alt/Tab); a 3-key combo must start Ctrl+Tab+<anything>.
 * Framework-free so it's shared between the renderer (KeybindsSettings'
 * capture control builds a combo string the same shape this expects) and
 * main (the authoritative check keybinds.ipc.ts runs before actually
 * registering a global shortcut).
 */
const REQUIRED_FIRST_KEYS = ['Shift', 'Ctrl', 'Alt', 'Tab']

export function validateCombo(combo: string): boolean {
  const tokens = combo.split('+').filter((t) => t.length > 0)
  const unique = new Set(tokens)
  if (unique.size !== tokens.length) return false

  if (tokens.length === 2) return REQUIRED_FIRST_KEYS.includes(tokens[0])
  if (tokens.length === 3) return tokens[0] === 'Ctrl' && tokens[1] === 'Tab'
  return false
}
