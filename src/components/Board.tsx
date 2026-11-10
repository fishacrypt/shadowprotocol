import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { CheckCircle2, Hourglass, Lock } from 'lucide-react'
import { ActionPanel } from '@/components/ActionPanel'
import { PrizePanel } from '@/components/PrizePanel'
import { RoundTrack } from '@/components/RoundTrack'
import { Avatar, ArtifactGlyph, Countdown, PrivacyBadge, SecretValue, TxBanner, useCountdown } from '@/components/ui'
import { useArtifact } from '@/hooks/useShadow'
import { useMyState } from '@/hooks/useMyState'
import { useTxFlow } from '@/hooks/useTxFlow'
import { shadowAbi } from '@/lib/abi'
import { SHADOW_ADDRESS } from '@/lib/env'
import { encryptMove, type MoveInput } from '@/lib/fhe'
import {
  ARTIFACTS,
  MAX_MISSES,
  type MatchInfo,
  MatchState,
  ROUND_INCOME,
  ROUNDS,
  START_CREDITS,
  shortAddress,
  slotOf,
} from '@/lib/game'
import { play } from '@/lib/sfx'
import { useReadContracts } from 'wagmi'

function useMissed(match: MatchInfo) {
  const { data } = useReadContracts({
    contracts: match.players.map((_, i) => ({ address: SHADOW_ADDRESS, abi: shadowAbi, functionName: 'missedRounds' as const, args: [match.id, i] as const })),
    query: { enabled: !!SHADOW_ADDRESS, refetchInterval: 8000 },
  })
  return match.players.map((_, i) => Number(data?.[i]?.result ?? 0))
}

export function Board({ match }: { match: MatchInfo }) {
  const { address } = useAccount()
  const mySlot = slotOf(match, address)
  const isPlayer = mySlot >= 0
  const art = useArtifact(match.id, match.round, match.seedRevealed)
  const mine = useMyState(match.id, match.round, isPlayer)
  const { state, run, reset, busy } = useTxFlow()
  const missed = useMissed(match)
  const committing = match.state === MatchState.Commit
  const allIn = match.submittedMask === (1 << match.playerCount) - 1
  const left = useCountdown(match.deadline, committing)
  const expired = committing && left === 0
  const iSubmitted = isPlayer && (match.submittedMask & (1 << mySlot)) !== 0
  const canResolve = match.state === MatchState.Resolving || (committing && (allIn || expired))

  const lastRound = useRef(match.round)
  useEffect(() => {
    if (lastRound.current !== match.round) {
      play('reveal')
      lastRound.current = match.round
    }
  }, [match.round])

  async function submit(move: MoveInput) {
    await run(async (ctx) => {
      ctx.set('encrypting', 'Preparing encrypted input')
      const enc = await encryptMove(ctx.contract, ctx.address, move)
      await ctx.write('submitMove', [match.id, enc.action, enc.bid, enc.power, enc.target, enc.inputProof], 'Awaiting wallet signature for your sealed move')
      play('lock')
    })
  }

  async function resolve() {
    await run(async (ctx) => {
      if (match.state === MatchState.Commit) {
        await ctx.write('closeRound', [match.id], 'Closing the round: comparing encrypted bids')
      }
      await ctx.write('applyRound', [match.id], 'Settling credits and scores under encryption')
      ctx.set('processing', 'Round settled. Reading the public result')
      play('reveal')
    })
  }

  const maxCredits = mine.credits ?? START_CREDITS + match.round * ROUND_INCOME
  const prizeVisible = match.prizeFunded

  return (
    <div className="space-y-4">
      <RoundTrack match={match} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="panel relative overflow-hidden p-6" aria-label="Current artifact">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-volt/20 blur-3xl" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${match.round}-${art?.kind}`}
                    initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 160, damping: 16 }}
                  >
                    {art ? <ArtifactGlyph kind={art.kind} size={104} /> : <div className="h-[104px] w-[104px] rounded-full border border-dashed border-white/20" />}
                  </motion.div>
                </AnimatePresence>
                <div>
                  <p className="label">Round {Math.min(match.round + 1, ROUNDS)} of {ROUNDS}</p>
                  <h2 className="text-3xl font-bold tracking-tight">{art ? ARTIFACTS[art.kind].name : 'Unknown artifact'}</h2>
                  <p className="text-sm text-white/50">{art ? ARTIFACTS[art.kind].lore : ''}</p>
                  {art && <p className="mt-1 font-display text-lg text-pulse-soft">{art.points} points <span className="text-xs text-white/40">(x2 on a won Double)</span></p>}
                </div>
              </div>
              <div className="text-right">
                <p className="label">{committing ? 'Time left' : 'Phase'}</p>
                {committing ? <Countdown deadline={match.deadline} active /> : <span className="font-display text-xl text-pulse-soft">Resolving</span>}
              </div>
            </div>
          </section>

          {committing && isPlayer && !iSubmitted && (
            <ActionPanel match={match} mySlot={mySlot} maxCredits={maxCredits} creditsKnown={mine.credits !== undefined} busy={busy} onSubmit={(m) => void submit(m)} />
          )}

          {committing && iSubmitted && (
            <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="panel flex items-center gap-4 p-6">
              <Lock className="text-volt-soft" />
              <div>
                <p className="font-display text-lg font-semibold">Your move is sealed</p>
                <p className="text-sm text-white/55">It lives onchain as ciphertext. Nobody, including you, can change it now.</p>
              </div>
            </motion.div>
          )}

          {!isPlayer && (
            <div className="panel p-5 text-sm text-white/60">You are watching this match. Public information only: who has sealed a move, never what is in it.</div>
          )}

          {canResolve && (
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-display text-lg font-semibold">{allIn ? 'Everyone sealed a move' : match.state === MatchState.Resolving ? 'Bids compared. Settle the round.' : 'The timer ran out'}</p>
                <p className="text-sm text-white/55">Anyone can resolve. The contract compares the encrypted bids and updates balances without decrypting them.</p>
              </div>
              <button onClick={() => void resolve()} disabled={busy} className="btn-cyan">Resolve round</button>
            </div>
          )}
          <TxBanner state={state} onClose={reset} />
        </div>

        <aside className="space-y-4">
          <section className="panel p-5" aria-label="Your private resources">
            <div className="flex items-center justify-between">
              <p className="label">Your private resources</p>
              <PrivacyBadge state={mine.credits !== undefined ? 'revealed' : mine.loading ? 'processing' : 'encrypted'} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-white/45">Credits</dt>
                <dd className="mt-1"><SecretValue value={mine.credits} loading={mine.loading} canReveal={isPlayer} onReveal={() => void mine.reveal()} /></dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Score</dt>
                <dd className="mt-1"><SecretValue value={mine.score} loading={mine.loading} /></dd>
              </div>
            </dl>
            {mine.error && <p className="mt-3 text-xs text-rose-300">{mine.error}</p>}
            <p className="mt-3 text-[11px] text-white/35">Decrypting asks your wallet to sign once. The result never leaves your browser.</p>
          </section>

          <section className="panel p-5" aria-label="Players">
            <p className="label mb-3">Players</p>
            <ul className="space-y-3">
              {match.players.map((p, i) => {
                const sealed = (match.submittedMask & (1 << i)) !== 0
                const isMe = i === mySlot
                return (
                  <li key={p} className="flex items-center gap-3">
                    <Avatar address={p} size={38} ring={isMe ? 'me' : sealed ? 'ok' : 'wait'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-white/85">{shortAddress(p)} {isMe && <span className="text-pulse-soft">(you)</span>}</p>
                      <p className="text-[11px] text-white/40">Credits <span className="cipher text-volt-soft/70">encrypted</span> / missed {missed[i]}/{MAX_MISSES}</p>
                    </div>
                    {committing && (sealed ? <CheckCircle2 size={18} className="text-emerald-400" aria-label="Sealed" /> : <Hourglass size={16} className="animate-pulse text-white/30" aria-label="Thinking" />)}
                  </li>
                )
              })}
            </ul>
          </section>
          {prizeVisible || isPlayer ? <PrizePanel match={match} /> : null}
        </aside>
      </div>
    </div>
  )
}
