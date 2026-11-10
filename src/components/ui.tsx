import { useEffect, useId, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, Lock, ShieldCheck, Unlock, Volume2, VolumeX, X } from 'lucide-react'
import clsx from 'clsx'
import { avatarGradient, formatCountdown } from '@/lib/game'
import { setMuted, useMuted, play } from '@/lib/sfx'
import type { TxState } from '@/hooks/useTxFlow'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TARGET_CHAIN_ID } from '@/lib/env'

export type PrivacyState = 'encrypted' | 'processing' | 'revealed' | 'verified'

const PRIVACY_META: Record<PrivacyState, { label: string; cls: string; icon: ReactNode }> = {
  encrypted: { label: 'Encrypted', cls: 'border-volt/40 bg-volt/10 text-volt-soft', icon: <Lock size={12} /> },
  processing: {
    label: 'Computing',
    cls: 'border-pulse/40 bg-pulse/10 text-pulse-soft',
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  revealed: { label: 'Authorised', cls: 'border-white/20 bg-white/5 text-white', icon: <Unlock size={12} /> },
  verified: { label: 'Verified', cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', icon: <ShieldCheck size={12} /> },
}

export function PrivacyBadge({ state, label }: { state: PrivacyState; label?: string }) {
  const m = PRIVACY_META[state]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em]', m.cls)}>
      {m.icon}
      {label ?? m.label}
    </span>
  )
}

const HEX = '0123456789abcdef'

/** Scrambling ciphertext look-alike. Purely visual; it is never presented as a real handle. */
export function CipherText({ length = 10, className }: { length?: number; className?: string }) {
  const [text, setText] = useState(() => Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join(''))
  useEffect(() => {
    const t = setInterval(() => {
      setText(Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join(''))
    }, 140)
    return () => clearInterval(t)
  }, [length])
  return <span className={clsx('cipher text-volt-soft/80', className)}>{text}</span>
}

/** A value that is encrypted for everyone except those authorised to read it. */
export function SecretValue({ value, loading, onReveal, canReveal, suffix }: { value?: number | bigint; loading?: boolean; onReveal?: () => void; canReveal?: boolean; suffix?: string }) {
  if (value !== undefined) {
    return (
      <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-display text-2xl font-semibold tabular-nums text-white">
        {value.toString()}
        {suffix && <span className="ml-1 text-sm text-white/45">{suffix}</span>}
      </motion.span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      {loading ? <Loader2 size={16} className="animate-spin text-pulse" /> : <Lock size={16} className="text-volt-soft" />}
      <CipherText length={8} className="text-lg" />
      {canReveal && onReveal && !loading && (
        <button onClick={onReveal} className="rounded-md border border-pulse/40 px-2 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-pulse-soft hover:bg-pulse/10">
          Decrypt
        </button>
      )}
    </span>
  )
}

export function Avatar({ address, size = 44, ring, label }: { address: string; size?: number; ring?: 'ok' | 'wait' | 'me'; label?: string }) {
  const ringCls = ring === 'ok' ? 'ring-emerald-400/70' : ring === 'me' ? 'ring-pulse/80' : ring === 'wait' ? 'ring-white/10' : 'ring-transparent'
  return (
    <div
      className={clsx('flex shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white/95 ring-2 ring-offset-2 ring-offset-ink-800', ringCls)}
      style={{ width: size, height: size, background: avatarGradient(address) }}
      aria-label={label}
    >
      {address.slice(2, 4).toUpperCase()}
    </div>
  )
}

const GLYPHS: ReactNode[] = [
  <polygon key="0" points="32,6 52,22 46,52 18,52 12,22" />,
  <g key="1"><ellipse cx="32" cy="32" rx="20" ry="26" /><path d="M20 32h24M32 12v40" /></g>,
  <g key="2"><path d="M10 48 L16 20 L26 34 L32 14 L38 34 L48 20 L54 48 Z" /></g>,
  <g key="3"><circle cx="32" cy="32" r="22" /><circle cx="32" cy="32" r="13" /><circle cx="32" cy="32" r="4" /></g>,
  <g key="4"><path d="M32 8 L54 20 V44 L32 56 L10 44 V20 Z" /><path d="M32 8 V56 M10 20 L54 44 M54 20 L10 44" /></g>,
  <g key="5"><circle cx="32" cy="32" r="8" /><path d="M32 4 C48 16 48 48 32 60 C16 48 16 16 32 4Z" /><path d="M4 32 C16 16 48 16 60 32 C48 48 16 48 4 32Z" /></g>,
]

export function ArtifactGlyph({ kind, size = 120, glow = true }: { kind: number; size?: number; glow?: boolean }) {
  const id = `glyph-${useId().replace(/:/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={clsx(glow && 'drop-shadow-[0_0_18px_rgba(139,92,246,0.7)]')} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="64" y2="64">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id})`} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="rgba(139,92,246,0.10)">
        {GLYPHS[kind % GLYPHS.length]}
      </g>
    </svg>
  )
}

export function useCountdown(deadline: number, active: boolean): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [active])
  return Math.max(0, deadline - now)
}

export function Countdown({ deadline, active }: { deadline: number; active: boolean }) {
  const left = useCountdown(deadline, active)
  useEffect(() => {
    if (active && left > 0 && left <= 10) play('tick')
  }, [left, active])
  const urgent = active && left <= 30
  return (
    <span className={clsx('font-display text-3xl font-semibold tabular-nums', urgent ? 'animate-flicker text-rose-300' : 'text-white')}>
      {active ? formatCountdown(left) : '--:--'}
    </span>
  )
}

const PHASE_STYLE: Record<string, string> = {
  connecting: 'border-white/15 text-white/80',
  switching: 'border-pulse/40 text-pulse-soft',
  encrypting: 'border-volt/50 text-volt-soft',
  signing: 'border-volt/50 text-volt-soft',
  submitting: 'border-pulse/40 text-pulse-soft',
  processing: 'border-pulse/40 text-pulse-soft',
  decrypting: 'border-pulse/40 text-pulse-soft',
  done: 'border-emerald-400/40 text-emerald-300',
  error: 'border-rose-400/40 text-rose-300',
}

export function TxBanner({ state, onClose }: { state: TxState; onClose: () => void }) {
  if (state.phase === 'idle') return null
  const working = !['done', 'error'].includes(state.phase)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className={clsx('flex items-start gap-3 rounded-xl border bg-black/40 px-4 py-3 text-sm', PHASE_STYLE[state.phase])}
    >
      <span className="mt-0.5">
        {working ? <Loader2 size={16} className="animate-spin" /> : state.phase === 'done' ? <CheckCircle2 size={16} /> : <X size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold">{state.phase === 'error' ? state.error : state.label}</p>
        {state.hash && (
          <a className="font-mono text-xs underline decoration-white/20 underline-offset-2" href={buildTxExplorerUrl(TARGET_CHAIN_ID, state.hash)} target="_blank" rel="noopener noreferrer">
            {state.hash.slice(0, 12)}...{state.hash.slice(-8)}
          </a>
        )}
      </div>
      {!working && (
        <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Dismiss">
          <X size={16} />
        </button>
      )}
    </motion.div>
  )
}

export function SoundToggle() {
  const muted = useMuted()
  return (
    <button
      onClick={() => {
        setMuted(!muted)
        if (muted) play('click')
      }}
      className="btn-ghost !min-h-[40px] !px-3"
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={muted}
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  )
}
