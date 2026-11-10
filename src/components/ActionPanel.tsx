import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, Flame, Lock, Shield, Swords, Zap } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, PrivacyBadge } from '@/components/ui'
import { ACTIONS, Action, type MatchInfo, shortAddress } from '@/lib/game'
import type { MoveInput } from '@/lib/fhe'
import { play } from '@/lib/sfx'

const ICONS = {
  [Action.Bid]: Flame,
  [Action.Shield]: Shield,
  [Action.Sabotage]: Swords,
  [Action.Double]: Zap,
  [Action.Pass]: Eye,
}

interface Props {
  match: MatchInfo
  mySlot: number
  /** Best known spendable balance. Only a hint: the contract clamps to your real encrypted credits. */
  maxCredits: number
  creditsKnown: boolean
  busy: boolean
  onSubmit: (move: MoveInput) => void
}

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="label" htmlFor={`s-${label}`}>{label}</label>
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
          className="w-24 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-right font-display text-lg font-semibold tabular-nums text-white focus:border-pulse focus:outline-none"
          aria-label={`${label} amount`}
        />
      </div>
      <input
        id={`s-${label}`}
        type="range"
        min={0}
        max={max}
        step={10}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value))
          play('tick')
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-volt"
      />
    </div>
  )
}

export function ActionPanel({ match, mySlot, maxCredits, creditsKnown, busy, onSubmit }: Props) {
  const [action, setAction] = useState<Action>(Action.Bid)
  const [bid, setBid] = useState(100)
  const [power, setPower] = useState(50)
  const [target, setTarget] = useState(() => (mySlot === 0 ? 1 : 0))
  const def = ACTIONS[action]
  const total = (def.usesBid ? bid : 0) + (def.usesPower ? power : 0)
  const doubleTooSmall = action === Action.Double && power * 2 < bid
  const overBudget = creditsKnown && total > maxCredits
  const opponents = match.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== mySlot)

  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label">Your sealed move</p>
          <h3 className="text-xl font-semibold">Choose a tactic</h3>
        </div>
        <PrivacyBadge state="encrypted" label="Encrypted before it leaves your browser" />
      </div>

      <div role="radiogroup" aria-label="Action" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ACTIONS.map((a) => {
          const Icon = ICONS[a.id]
          const active = a.id === action
          return (
            <button
              key={a.id}
              role="radio"
              aria-checked={active}
              onClick={() => {
                setAction(a.id)
                play('click')
              }}
              className={clsx(
                'flex min-h-[84px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all active:scale-[0.97]',
                active ? 'border-pulse bg-pulse/10 shadow-pulse' : 'border-white/10 bg-black/20 hover:border-white/30',
              )}
            >
              <Icon size={18} className={active ? 'text-pulse' : 'text-white/50'} />
              <span className="font-display text-sm font-semibold text-white">{a.name}</span>
              <span className="text-[11px] leading-tight text-white/45">{a.short}</span>
            </button>
          )
        })}
      </div>

      <motion.p key={action} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 rounded-lg bg-white/[0.03] p-3 text-sm text-white/65">
        {def.tradeoff}
      </motion.p>

      <div className="mt-5 space-y-5">
        {def.usesBid && <Slider label="Bid" value={bid} max={Math.max(maxCredits, 10)} onChange={setBid} />}
        {def.usesPower && <Slider label={def.powerLabel ?? 'Power'} value={power} max={Math.max(maxCredits, 10)} onChange={setPower} />}
        {def.usesTarget && (
          <fieldset>
            <legend className="label mb-2">Target</legend>
            <div className="flex flex-wrap gap-2">
              {opponents.map(({ p, i }) => (
                <button
                  key={p}
                  onClick={() => setTarget(i)}
                  aria-pressed={target === i}
                  className={clsx('flex min-h-[44px] items-center gap-2 rounded-xl border px-3 transition-colors', target === i ? 'border-rose-400/70 bg-rose-400/10' : 'border-white/10 hover:border-white/30')}
                >
                  <Avatar address={p} size={24} />
                  <span className="font-mono text-xs text-white/80">{shortAddress(p)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="mt-5 space-y-1 text-xs">
        <p className="text-white/45">
          Total committed: <span className="font-display text-sm tabular-nums text-white">{total}</span> credits
          {creditsKnown ? ` of ${maxCredits}` : ' (your balance is encrypted; the contract caps spending at what you hold)'}
        </p>
        {doubleTooSmall && <p className="text-amber-300">Stake is under half your bid, so Double is ignored and this plays as a plain bid.</p>}
        {overBudget && <p className="text-amber-300">Over your balance. The contract will clamp the bid first, then the tactic.</p>}
      </div>

      <button
        disabled={busy}
        onClick={() => {
          play('lock')
          onSubmit({
            action,
            bid: def.usesBid ? bid : 0,
            power: def.usesPower ? power : 0,
            target: def.usesTarget ? target : 0,
          })
        }}
        className="btn-primary mt-5 w-full !min-h-[52px] !text-base"
      >
        <Lock size={18} /> Seal and submit move
      </button>
      <p className="mt-2 text-center text-[11px] text-white/35">Moves cannot be edited after sealing. Only you ever see what is inside.</p>
    </div>
  )
}
