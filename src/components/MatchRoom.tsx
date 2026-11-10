import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { ArrowLeft, Check, Copy, Loader2, Share2, ShieldCheck } from 'lucide-react'
import { Avatar, PrivacyBadge, TxBanner } from '@/components/ui'
import { Board } from '@/components/Board'
import { PrivacyMap } from '@/components/PrivacyMap'
import { Results } from '@/components/Results'
import { useMatch } from '@/hooks/useShadow'
import { useTxFlow } from '@/hooks/useTxFlow'
import { shadowAbi } from '@/lib/abi'
import { publicDecryptWithRetry } from '@/lib/fhe'
import { TARGET_CHAIN_ID } from '@/lib/env'
import { type MatchInfo, MatchState, STATE_LABELS, shortAddress, slotOf } from '@/lib/game'
import { buildShareLink } from '@/lib/share'
import { play } from '@/lib/sfx'
import { usePublicClient } from 'wagmi'
import type { Hex, PublicClient } from 'viem'

function LobbyPanel({ match }: { match: MatchInfo }) {
  const { address, isConnected } = useAccount()
  const { state, run, reset, busy } = useTxFlow()
  const [link, setLink] = useState<string>()
  const [copied, setCopied] = useState(false)
  const joined = slotOf(match, address) >= 0
  const isCreator = !!address && address.toLowerCase() === match.creator.toLowerCase()

  useEffect(() => {
    let live = true
    void buildShareLink(`/?match=${match.id}`).then((l) => live && setLink(l))
    return () => {
      live = false
    }
  }, [match.id])

  const call = (fn: string, label: string) => run(async (ctx) => void (await ctx.write(fn, [match.id], label)))

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">Waiting room</p>
            <h2 className="text-2xl font-semibold">{match.playerCount} of {match.maxPlayers} players</h2>
          </div>
          <PrivacyBadge state="encrypted" label="Credits are encrypted once it starts" />
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: match.maxPlayers }).map((_, i) => {
            const p = match.players[i]
            return (
              <motion.li key={i} layout className="panel-inner flex items-center gap-3 p-3">
                {p ? <Avatar address={p} size={42} ring={p.toLowerCase() === address?.toLowerCase() ? 'me' : 'wait'} /> : <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-dashed border-white/20 text-white/30"><Loader2 size={16} className="animate-spin" /></span>}
                <div>
                  <p className="font-mono text-sm text-white/85">{p ? shortAddress(p) : 'Open seat'}</p>
                  <p className="text-[11px] text-white/40">{p ? (i === 0 ? 'Creator' : `Player ${i + 1}`) : 'Waiting'}</p>
                </div>
              </motion.li>
            )
          })}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          {!joined && match.playerCount < match.maxPlayers && (
            <button disabled={busy || !isConnected} onClick={() => { play('click'); void call('joinMatch', 'Awaiting wallet signature to join') }} className="btn-primary">Join match</button>
          )}
          {isCreator && match.playerCount >= 2 && match.playerCount < match.maxPlayers && (
            <button disabled={busy} onClick={() => void call('startMatch', 'Starting the match')} className="btn-cyan">Start with {match.playerCount} players</button>
          )}
          {isCreator && <button disabled={busy} onClick={() => void call('cancelMatch', 'Cancelling the lobby')} className="btn-ghost">Cancel</button>}
          {!isConnected && <p className="self-center text-sm text-white/50">Connect a wallet to join.</p>}
        </div>
        <div className="mt-4"><TxBanner state={state} onClose={reset} /></div>
      </section>
      <section className="panel flex items-center gap-3 p-4">
        <Share2 size={16} className="text-white/50" />
        <input readOnly value={link ?? 'Preparing link...'} aria-label="Invite link" className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white/60 focus:outline-none" />
        <button
          disabled={!link}
          onClick={() => {
            if (!link) return
            void navigator.clipboard.writeText(link).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
          className="btn-ghost !min-h-[40px]"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy invite'}
        </button>
      </section>
    </div>
  )
}

/** Seed generation runs inside the FHE coprocessor; anyone may submit the KMS-signed cleartext. */
function SeedPanel({ match }: { match: MatchInfo }) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  const { isConnected } = useAccount()
  const { state, run, reset, busy } = useTxFlow()
  const tried = useRef(false)

  async function reveal() {
    await run(async (ctx) => {
      ctx.set('decrypting', 'Awaiting authorised decryption of the artifact seed')
      const handle = (await (client as PublicClient).readContract({ address: ctx.contract, abi: shadowAbi, functionName: 'seedHandle', args: [match.id] }))
      const { values, proof } = await publicDecryptWithRetry([handle])
      await ctx.write('revealSeed', [match.id, values[0], proof], 'Awaiting wallet signature to publish the verified seed')
      play('reveal')
    })
  }

  useEffect(() => {
    if (tried.current || !isConnected || !client) return
    tried.current = true
    void reveal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, client])

  return (
    <section className="panel mx-auto max-w-2xl space-y-4 p-8 text-center">
      <Loader2 className="mx-auto animate-spin text-pulse" size={32} />
      <h2 className="text-2xl font-semibold">Drawing the artifact seed</h2>
      <p className="mx-auto max-w-md text-sm text-white/60">
        The seed was generated inside the FHE coprocessor, so nobody (including the creator) could predict it. It is published only with a KMS signature that the contract verifies.
      </p>
      <button onClick={() => void reveal()} disabled={busy || !isConnected} className="btn-cyan">Publish verified seed</button>
      <TxBanner state={state} onClose={reset} />
    </section>
  )
}

/** After round five: public decryption of every score, verified onchain before the match completes. */
function FinalizePanel({ match }: { match: MatchInfo }) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  const { state, run, reset, busy } = useTxFlow()

  async function finalize() {
    await run(async (ctx) => {
      ctx.set('decrypting', 'Awaiting authorised decryption of final scores')
      const handles = (await (client as PublicClient).readContract({ address: ctx.contract, abi: shadowAbi, functionName: 'scoreHandles', args: [match.id] }))
      const { values, proof } = await publicDecryptWithRetry([...handles])
      await ctx.write('finalizeMatch', [match.id, values.map(Number), proof], 'Awaiting wallet signature to verify the final scores')
    })
  }

  return (
    <section className="panel mx-auto max-w-2xl space-y-4 p-8 text-center">
      <ShieldCheck className="mx-auto text-pulse" size={36} />
      <h2 className="text-2xl font-semibold">All rounds played</h2>
      <p className="mx-auto max-w-md text-sm text-white/60">
        Scores are still encrypted. Revealing them takes a KMS-signed decryption that the contract verifies before it ranks players and unlocks prizes.
      </p>
      <button onClick={() => void finalize()} disabled={busy} className="btn-primary">Reveal and verify final scores</button>
      <TxBanner state={state} onClose={reset} />
    </section>
  )
}

export function MatchRoom({ id, onBack }: { id: bigint; onBack: () => void }) {
  const { match, isLoading, isError } = useMatch(id)

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24 pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="btn-ghost !min-h-[40px]"><ArrowLeft size={16} /> Lobby</button>
        <h1 className="text-2xl font-bold tracking-tight">Match #{id.toString()}</h1>
        {match && <span className="rounded-full border border-white/10 px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-pulse-soft">{STATE_LABELS[match.state]}</span>}
      </div>

      {isLoading && !match && <div className="panel cipher-glow h-40" aria-busy />}
      {isError && !match && <div className="panel p-8 text-center text-white/60">Match #{id.toString()} does not exist on this deployment.</div>}

      {match?.state === MatchState.Lobby && <LobbyPanel match={match} />}
      {match?.state === MatchState.AwaitingSeed && <SeedPanel match={match} />}
      {match && (match.state === MatchState.Commit || match.state === MatchState.Resolving) && <Board match={match} />}
      {match?.state === MatchState.Finalizing && <FinalizePanel match={match} />}
      {match?.state === MatchState.Complete && <Results match={match} onPlayAgain={onBack} />}
      {match?.state === MatchState.Cancelled && <div className="panel p-8 text-center text-white/60">The creator cancelled this lobby.</div>}

      {match && match.state >= MatchState.Commit && match.state <= MatchState.Finalizing && <PrivacyMap compact />}
    </div>
  )
}
