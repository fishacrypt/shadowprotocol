import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { parseEventLogs } from 'viem'
import { Clock, Coins, Plus, Search, Users } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, TxBanner } from '@/components/ui'
import { useMatchList } from '@/hooks/useShadow'
import { useTxFlow } from '@/hooks/useTxFlow'
import { shadowAbi } from '@/lib/abi'
import { SHADOW_ADDRESS } from '@/lib/env'
import { type MatchInfo, MatchState, ROUND_DURATION_OPTIONS, ROUNDS, STATE_LABELS, slotOf } from '@/lib/game'
import { play } from '@/lib/sfx'

function StatusPill({ m }: { m: MatchInfo }) {
  const tone =
    m.state === MatchState.Lobby
      ? 'border-pulse/40 text-pulse-soft'
      : m.state === MatchState.Complete
        ? 'border-white/15 text-white/50'
        : m.state === MatchState.Cancelled
          ? 'border-rose-400/30 text-rose-300/80'
          : 'border-volt/40 text-volt-soft'
  return <span className={clsx('rounded-full border px-2.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em]', tone)}>{STATE_LABELS[m.state]}</span>
}

function MatchRow({ m, onOpen, me }: { m: MatchInfo; onOpen: () => void; me?: `0x${string}` }) {
  const mine = slotOf(m, me) >= 0
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={onOpen} className="panel group flex w-full flex-wrap items-center gap-4 p-4 text-left transition-colors hover:border-pulse/40">
        <span className="font-display text-lg font-semibold tabular-nums text-white/90">#{m.id.toString()}</span>
        <div className="flex -space-x-2">
          {m.players.map((p) => (
            <Avatar key={p} address={p} size={30} />
          ))}
          {Array.from({ length: m.maxPlayers - m.playerCount }).map((_, i) => (
            <span key={i} className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-dashed border-white/20 bg-black/30 text-[10px] text-white/30">+</span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-sm text-white/55">
          <Users size={14} />
          {m.playerCount}/{m.maxPlayers}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-white/55">
          <Clock size={14} />
          {Math.round(m.roundDuration / 60)} min rounds
        </span>
        {m.prizeFunded && (
          <span className="flex items-center gap-1.5 text-sm text-pulse-soft">
            <Coins size={14} /> cUSDT prize
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {mine && <span className="rounded-full bg-pulse/15 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-pulse-soft">You</span>}
          <StatusPill m={m} />
        </span>
      </button>
    </motion.li>
  )
}

export function Lobby({ onOpenMatch }: { onOpenMatch: (id: bigint) => void }) {
  const { address } = useAccount()
  const { list, isLoading, total } = useMatchList(30)
  const { state, run, reset, busy } = useTxFlow()
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [duration, setDuration] = useState(ROUND_DURATION_OPTIONS[1].seconds)
  const [lookup, setLookup] = useState('')

  async function create() {
    play('click')
    const id = await run(async (ctx) => {
      const receipt = await ctx.write('createMatch', [maxPlayers, duration], 'Awaiting wallet signature to create the match')
      const events = parseEventLogs({ abi: shadowAbi, eventName: 'MatchCreated', logs: receipt.logs })
      const created = events[0]?.args as { id: bigint } | undefined
      return created?.id
    })
    if (id) {
      play('reveal')
      onOpenMatch(id)
    }
  }

  if (!SHADOW_ADDRESS) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold">Contracts not configured</h2>
          <p className="mt-2 text-white/60">Set <span className="cipher text-pulse-soft">VITE_SHADOW_PROTOCOL_ADDRESS</span> in <span className="cipher">.env</span> to the deployed ShadowProtocol address on Sepolia, then restart the dev server.</p>
        </div>
      </div>
    )
  }

  const open = list.filter((m) => m.state === MatchState.Lobby)
  const rest = list.filter((m) => m.state !== MatchState.Lobby)

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 pt-10 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="panel p-5">
          <p className="label">Create a match</p>
          <h2 className="mt-1 text-xl font-semibold">Open a table</h2>
          <div className="mt-5 space-y-5">
            <fieldset>
              <legend className="label mb-2">Players</legend>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n)}
                    aria-pressed={maxPlayers === n}
                    className={clsx('min-h-[44px] rounded-xl border font-display text-sm font-semibold transition-colors', maxPlayers === n ? 'border-pulse bg-pulse/10 text-white shadow-pulse' : 'border-white/10 text-white/60 hover:border-white/30')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label mb-2">Round timer</legend>
              <div className="grid grid-cols-2 gap-2">
                {ROUND_DURATION_OPTIONS.map((o) => (
                  <button
                    key={o.seconds}
                    onClick={() => setDuration(o.seconds)}
                    aria-pressed={duration === o.seconds}
                    className={clsx('min-h-[44px] rounded-xl border font-display text-sm font-semibold transition-colors', duration === o.seconds ? 'border-volt bg-volt/10 text-white shadow-volt' : 'border-white/10 text-white/60 hover:border-white/30')}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-white/45">{ROUNDS} rounds. Starts automatically when the table is full, or the creator can start with two players.</p>
            <button onClick={() => void create()} disabled={busy} className="btn-primary w-full">
              <Plus size={16} /> Create match
            </button>
            <TxBanner state={state} onClose={reset} />
          </div>
        </div>
        <form
          className="panel flex items-center gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^\d+$/.test(lookup) && BigInt(lookup) > 0n) onOpenMatch(BigInt(lookup))
          }}
        >
          <Search size={16} className="ml-2 text-white/40" />
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value.replace(/\D/g, ''))}
            placeholder="Open match by number"
            inputMode="numeric"
            aria-label="Match number"
            className="min-h-[44px] flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          <button className="btn-ghost !min-h-[40px]" disabled={!lookup}>Open</button>
        </form>
      </aside>

      <main className="space-y-6">
        <section aria-labelledby="open-heading">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="open-heading" className="text-xl font-semibold">Open lobbies</h2>
            <span className="text-xs text-white/40">{total === undefined ? '' : `${total.toString()} matches created`}</span>
          </div>
          {isLoading ? (
            <div className="panel cipher-glow h-20 rounded-2xl" aria-busy />
          ) : open.length === 0 ? (
            <div className="panel p-8 text-center text-white/55">No open lobbies. Create one and invite a rival.</div>
          ) : (
            <ul className="space-y-2">{open.map((m) => <MatchRow key={m.id.toString()} m={m} me={address} onOpen={() => onOpenMatch(m.id)} />)}</ul>
          )}
        </section>
        {rest.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="mb-3 text-xl font-semibold">Recent matches</h2>
            <ul className="space-y-2">{rest.map((m) => <MatchRow key={m.id.toString()} m={m} me={address} onOpen={() => onOpenMatch(m.id)} />)}</ul>
          </section>
        )}
      </main>
    </div>
  )
}
