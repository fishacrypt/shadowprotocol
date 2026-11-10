/** Tiny WebAudio sound kit. No audio files; every effect is synthesised on demand. */
import { useSyncExternalStore } from 'react'

type Sfx = 'click' | 'lock' | 'reveal' | 'win' | 'lose' | 'tick' | 'error'

const STORAGE_KEY = 'shadow:muted'
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
const listeners = new Set<() => void>()
let ctx: AudioContext | undefined

function audio(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return undefined
  ctx ??= new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const c = audio()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  const t0 = c.currentTime + start
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export function play(name: Sfx): void {
  if (muted) return
  switch (name) {
    case 'click':
      tone(520, 0, 0.06, 'triangle', 0.05)
      break
    case 'tick':
      tone(880, 0, 0.04, 'square', 0.025)
      break
    case 'lock':
      tone(180, 0, 0.16, 'sawtooth', 0.05, 90)
      tone(720, 0.05, 0.08, 'triangle', 0.04)
      break
    case 'reveal':
      tone(330, 0, 0.12, 'triangle', 0.05)
      tone(495, 0.08, 0.12, 'triangle', 0.05)
      tone(660, 0.16, 0.22, 'triangle', 0.05)
      break
    case 'win':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.28, 'triangle', 0.06))
      break
    case 'lose':
      tone(300, 0, 0.35, 'sawtooth', 0.04, 110)
      break
    case 'error':
      tone(200, 0, 0.18, 'square', 0.04, 140)
      break
  }
}

export function setMuted(next: boolean): void {
  muted = next
  localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  listeners.forEach((l) => l())
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => muted,
  )
}
