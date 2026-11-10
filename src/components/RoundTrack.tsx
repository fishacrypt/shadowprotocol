import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, ArtifactGlyph } from '@/components/ui'
import { useArtifact, useRoundWinner } from '@/hooks/useShadow'
import { ARTIFACTS, type MatchInfo, MatchState, NO_WINNER, ROUNDS } from '@/lib/game'

function Chip({ match, round }: { match: MatchInfo; round: number }) {
  const resolved = round < match.round || (round === match.round && match.state === MatchState.Resolving)
  const current = round === match.round && match.state === MatchState.Commit
  const art = useArtifact(match.id, round, match.seedRevealed)
  const winner = useRoundWinner(match.id, round, resolved)
  const w = winner.data
  return (
    <li
      className={clsx(
        'flex min-w-[96px] flex-1 flex-col items-center gap-1 rounded-xl border p-3 text-center',
        current ? 'border-pulse bg-pulse/10 shadow-pulse' : resolved ? 'border-white/10 bg-black/30' : 'border-white/5 bg-black/20 opacity-70',
      )}
      aria-current={current ? 'step' : undefined}
    >
      <span className="label">Round {round + 1}</span>
      {art ? <ArtifactGlyph kind={art.kind} size={36} glow={false} /> : <span className="h-9 w-9 rounded-full border border-dashed border-white/15" />}
      <span className="text-[11px] text-white/50">{art ? `${ARTIFACTS[art.kind].name} / ${art.points} pts` : 'Hidden'}</span>
      <span className="flex h-7 items-center">
        {!resolved ? null : winner.isLoading ? (
          <Loader2 size={14} className="animate-spin text-pulse" />
        ) : w === undefined ? (
          <span className="text-[10px] text-white/30">pending</span>
        ) : w === NO_WINNER ? (
          <span className="text-[11px] text-white/40">No winner</span>
        ) : match.players[w] ? (
          <Avatar address={match.players[w]} size={24} />
        ) : null}
      </span>
    </li>
  )
}

export function RoundTrack({ match }: { match: MatchInfo }) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Round progression">
      {Array.from({ length: ROUNDS }).map((_, r) => (
        <Chip key={r} match={match} round={r} />
      ))}
    </ol>
  )
}
