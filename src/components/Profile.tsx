import { useAccount } from 'wagmi'
import { Award, Medal, Swords, Target, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui'
import { usePlayerHistory, usePlayerStats } from '@/hooks/useShadow'
import { MatchState, STATE_LABELS, shortAddress, slotOf } from '@/lib/game'

const BADGES = [
  { id: 'init', name: 'Initiate', desc: 'Complete a match', icon: Swords, ok: (s: S) => s.matches >= 1 },
  { id: 'first', name: 'First Victory', desc: 'Win a match', icon: Trophy, ok: (s: S) => s.wins >= 1 },
  { id: 'hat', name: 'Hat Trick', desc: 'Win 3 matches', icon: Medal, ok: (s: S) => s.wins >= 3 },
  { id: 'vet', name: 'Veteran', desc: 'Complete 5 matches', icon: Award, ok: (s: S) => s.matches >= 5 },
  { id: 'high', name: 'High Roller', desc: 'Score 15+ in one match', icon: Target, ok: (s: S) => s.bestScore >= 15 },
]
interface S { matches: number; wins: number; bestScore: number; totalScore: number }

export function Profile({ onOpenMatch }: { onOpenMatch: (id: bigint) => void }) {
  const { address, isConnected } = useAccount()
  const { stats, isLoading } = usePlayerStats(address)
  const history = usePlayerHistory(address)

  if (!isConnected || !address) {
    return <div className="mx-auto max-w-xl px-4 py-20"><div className="panel p-8 text-center text-white/60">Connect a wallet to see your profile, win rate and match history.</div></div>
  }
  const s: S = stats ?? { matches: 0, wins: 0, bestScore: 0, totalScore: 0 }
  const rate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pb-24 pt-10">
      <section className="panel flex flex-wrap items-center gap-5 p-6">
        <Avatar address={address} size={64} ring="me" />
        <div>
          <p className="label">Player</p>
          <h1 className="font-mono text-2xl font-semibold">{shortAddress(address)}</h1>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Career statistics">
        {[
          ['Win rate', isLoading ? '...' : `${rate}%`],
          ['Victories', String(s.wins)],
          ['Matches', String(s.matches)],
          ['Best score', String(s.bestScore)],
        ].map(([l, v]) => (
          <div key={l} className="panel px-5 py-4">
            <p className="label">{l}</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      <section className="panel p-5" aria-label="Achievements">
        <p className="label mb-3">Achievement badges</p>
        <ul className="grid gap-3 sm:grid-cols-5">
          {BADGES.map((b) => {
            const on = b.ok(s)
            return (
              <li key={b.id} className={clsx('flex flex-col items-center gap-1 rounded-xl border p-3 text-center', on ? 'border-volt/50 bg-volt/10' : 'border-white/5 bg-black/20 opacity-50')}>
                <b.icon size={22} className={on ? 'text-pulse' : 'text-white/40'} />
                <span className="font-display text-sm font-semibold">{b.name}</span>
                <span className="text-[11px] text-white/45">{b.desc}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel p-5" aria-label="Match history">
        <p className="label mb-3">Match history</p>
        {history.isLoading ? (
          <div className="cipher-glow h-14 rounded-xl" aria-busy />
        ) : !history.data?.length ? (
          <p className="text-sm text-white/55">No matches yet. Join a lobby to start your record.</p>
        ) : (
          <ul className="space-y-2">
            {history.data.map(({ match, result }) => {
              const slot = slotOf(match, address)
              const won = !!result && (result.winnersMask & (1 << slot)) !== 0
              return (
                <li key={match.id.toString()}>
                  <button onClick={() => onOpenMatch(match.id)} className="flex min-h-[52px] w-full items-center gap-4 rounded-xl border border-white/5 bg-black/20 px-4 text-left hover:border-pulse/40">
                    <span className="font-display font-semibold tabular-nums">#{match.id.toString()}</span>
                    <span className="text-sm text-white/55">{match.playerCount} players</span>
                    <span className="ml-auto text-sm text-white/55">{match.state === MatchState.Complete ? (result ? `Score ${result.scores[slot] ?? 0}` : 'Complete') : STATE_LABELS[match.state]}</span>
                    {match.state === MatchState.Complete && result && (
                      <span className={clsx('rounded-full px-2.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider', won ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-white/50')}>{won ? 'Won' : 'Lost'}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
