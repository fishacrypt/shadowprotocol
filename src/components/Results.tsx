import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAccount, useReadContracts } from 'wagmi'
import { Crown, Frown, RotateCcw, ShieldCheck, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, PrivacyBadge, SecretValue, TxBanner } from '@/components/ui'
import { RoundTrack } from '@/components/RoundTrack'
import { useFinalResult } from '@/hooks/useShadow'
import { useMyState } from '@/hooks/useMyState'
import { useTxFlow } from '@/hooks/useTxFlow'
import { shadowAbi } from '@/lib/abi'
import { SHADOW_ADDRESS, TARGET_CHAIN_ID } from '@/lib/env'
import { type MatchInfo, MAX_MISSES, shortAddress, slotOf } from '@/lib/game'
import { play } from '@/lib/sfx'

export function Results({ match, onPlayAgain }: { match: MatchInfo; onPlayAgain: () => void }) {
  const { address } = useAccount()
  const mySlot = slotOf(match, address)
  const { data: result, isLoading } = useFinalResult(match.id, true)
  const mine = useMyState(match.id, 99, mySlot >= 0)
  const { state, run, reset, busy } = useTxFlow()

  const { data: claimData, refetch } = useReadContracts({
    contracts: [
      { address: SHADOW_ADDRESS, abi: shadowAbi, chainId: TARGET_CHAIN_ID, functionName: 'prizeClaimed', args: [match.id, Math.max(mySlot, 0)] },
      { address: SHADOW_ADDRESS, abi: shadowAbi, chainId: TARGET_CHAIN_ID, functionName: 'refundClaimed', args: [match.id] },
      ...match.players.map((_, i) => ({ address: SHADOW_ADDRESS, abi: shadowAbi, chainId: TARGET_CHAIN_ID, functionName: 'missedRounds' as const, args: [match.id, i] as const })),
    ],
    query: { enabled: !!SHADOW_ADDRESS },
  })
  const prizeClaimed = claimData?.[0]?.result === true
  const refundClaimed = claimData?.[1]?.result === true
  const missed = match.players.map((_, i) => Number(claimData?.[2 + i]?.result ?? 0))

  const iWon = !!result && mySlot >= 0 && (result.winnersMask & (1 << mySlot)) !== 0
  const noWinner = !!result && result.winnersMask === 0
  const played = useRef(false)
  useEffect(() => {
    if (!result || mySlot < 0 || played.current) return
    played.current = true
    play(iWon ? 'win' : 'lose')
  }, [result, iWon, mySlot])

  const ranking = result
    ? match.players
        .map((p, i) => ({ p, i, score: result.scores[i] ?? 0, won: (result.winnersMask & (1 << i)) !== 0, dq: missed[i] >= MAX_MISSES }))
        .sort((a, b) => Number(b.won) - Number(a.won) || b.score - a.score)
    : []

  async function claim() {
    await run(async (ctx) => {
      await ctx.write('claimPrize', [match.id], 'Awaiting wallet signature to claim your confidential prize')
      await refetch()
    })
  }
  async function refund() {
    await run(async (ctx) => {
      await ctx.write('claimRefund', [match.id], 'Returning the escrow to the creator')
      await refetch()
    })
  }

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className={clsx('panel relative overflow-hidden p-8 text-center', iWon && 'shadow-volt')}
      >
        <div aria-hidden className={clsx('pointer-events-none absolute inset-0 opacity-40 blur-3xl', iWon ? 'bg-gradient-to-br from-volt/40 to-pulse/30' : 'bg-gradient-to-br from-rose-500/10 to-transparent')} />
        {isLoading || !result ? (
          <p className="relative text-white/55">Reading the verified final scores...</p>
        ) : (
          <div className="relative">
            <motion.div initial={{ rotate: -12, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-black/40">
              {iWon ? <Trophy size={40} className="text-amber-300" /> : noWinner ? <ShieldCheck size={40} className="text-white/60" /> : <Frown size={40} className="text-white/60" />}
            </motion.div>
            <h2 className="mt-4 text-4xl font-bold tracking-tight">
              {mySlot < 0 ? 'Match complete' : iWon ? 'Victory' : noWinner ? 'No eligible winner' : 'Defeat'}
            </h2>
            <p className="mt-1 text-white/55">
              {noWinner ? 'Nobody scored while staying active, so any escrowed prize returns to the creator.' : `Winner: ${ranking.filter((r) => r.won).map((r) => shortAddress(r.p)).join(', ')}`}
            </p>
            <div className="mt-3 flex justify-center"><PrivacyBadge state="verified" label="Scores verified by KMS signatures" /></div>
          </div>
        )}
      </motion.section>

      {result && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <section className="panel p-5" aria-label="Leaderboard">
            <p className="label mb-3">Final leaderboard</p>
            <ol className="space-y-2">
              {ranking.map((r, idx) => (
                <motion.li key={r.p} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.08 }} className={clsx('flex items-center gap-3 rounded-xl border p-3', r.won ? 'border-amber-300/40 bg-amber-300/5' : 'border-white/5 bg-black/20')}>
                  <span className="w-6 text-center font-display text-lg text-white/40">{idx + 1}</span>
                  <Avatar address={r.p} size={36} ring={r.i === mySlot ? 'me' : undefined} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-white/85">{shortAddress(r.p)} {r.i === mySlot && <span className="text-pulse-soft">(you)</span>}</p>
                    {r.dq && <p className="text-[11px] text-rose-300">Disqualified from winning: {MAX_MISSES}+ missed rounds</p>}
                  </div>
                  {r.won && <Crown size={18} className="text-amber-300" />}
                  <span className="font-display text-2xl font-semibold tabular-nums">{r.score}</span>
                </motion.li>
              ))}
            </ol>
          </section>

          <aside className="space-y-4">
            {mySlot >= 0 && (
              <section className="panel p-5">
                <p className="label">Your resources</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-white/55">Credits left</span>
                  <SecretValue value={mine.credits} loading={mine.loading} canReveal onReveal={() => void mine.reveal()} />
                </div>
                <p className="mt-2 text-[11px] text-white/35">Spending per round stays private by design. Only you can decrypt your balance.</p>
              </section>
            )}
            {match.prizeFunded && (
              <section className="panel space-y-3 p-5">
                <p className="label">Confidential prize</p>
                {iWon && !prizeClaimed && <button disabled={busy} onClick={() => void claim()} className="btn-primary w-full">Claim your cUSDT share</button>}
                {iWon && prizeClaimed && <p className="text-sm text-emerald-300">Claimed. Decrypt your cUSDT balance in a confidential-token wallet.</p>}
                {!iWon && !noWinner && <p className="text-sm text-white/55">The prize goes to the winner. Its size is encrypted.</p>}
                {noWinner && !refundClaimed && <button disabled={busy} onClick={() => void refund()} className="btn-ghost w-full">Return escrow to creator</button>}
                {noWinner && refundClaimed && <p className="text-sm text-white/55">Escrow returned to the creator.</p>}
                <TxBanner state={state} onClose={reset} />
              </section>
            )}
            <button onClick={onPlayAgain} className="btn-primary w-full !min-h-[52px]"><RotateCcw size={16} /> Play again</button>
          </aside>
        </div>
      )}

      <section className="panel p-5">
        <p className="label mb-3">Round by round</p>
        <RoundTrack match={match} />
      </section>
    </div>
  )
}


