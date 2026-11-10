import { motion } from 'framer-motion'
import { ArrowRight, EyeOff, Gavel, Scale, Swords } from 'lucide-react'
import { CipherText } from '@/components/ui'
import { PrivacyMap } from '@/components/PrivacyMap'
import { useMatchList, useProtocolStats } from '@/hooks/useShadow'
import { MatchState, ROUNDS, START_CREDITS } from '@/lib/game'
import { SHADOW_ADDRESS } from '@/lib/env'
import { play } from '@/lib/sfx'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { TARGET_CHAIN_ID } from '@/lib/env'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel px-5 py-4">
      <p className="label">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
    </div>
  )
}

const WHY = [
  {
    icon: EyeOff,
    title: 'Transparent chains leak your hand',
    body: 'On a normal blockchain every bid, balance and tactic is public the moment it is sent. Rivals read your strategy and outbid you by one credit.',
  },
  {
    icon: Swords,
    title: 'Secrets become the gameplay',
    body: 'Your action, bid and target are encrypted with Zama FHE. The contract compares and settles them without ever decrypting. You bluff because nobody can look.',
  },
  {
    icon: Scale,
    title: 'Fairness you can check',
    body: 'The artifact seed comes from the FHE coprocessor and is verified against KMS signatures onchain. Final scores only count with a valid proof.',
  },
]

export function Landing({ onPlay }: { onPlay: () => void }) {
  const { matches, completed, isLoading } = useProtocolStats()
  const { list } = useMatchList(30)
  const open = list.filter((m) => m.state === MatchState.Lobby).length
  const live = list.filter((m) => m.state >= MatchState.AwaitingSeed && m.state <= MatchState.Finalizing).length
  const fmt = (v?: bigint | number) => (v === undefined ? (isLoading ? '...' : '-') : v.toString())

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24">
      <section className="relative overflow-hidden pb-14 pt-16 sm:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden opacity-[0.07]">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="whitespace-nowrap" style={{ transform: `translateX(${(i % 3) * -40}px)` }}>
              <CipherText length={96} className="text-xs" />
            </div>
          ))}
        </div>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="label text-pulse-soft">
          Encrypted strategy on Zama FHEVM / Ethereum Sepolia
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="mt-4 max-w-4xl text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-7xl"
        >
          <span className="bg-gradient-to-r from-white via-volt-soft to-pulse bg-clip-text text-transparent">SHADOW PROTOCOL</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-5 max-w-xl font-display text-xl text-white/70 sm:text-2xl">
          Your strategy is visible. <span className="text-white">Your secrets are not.</span>
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-4 max-w-xl text-white/55">
          Two to four players. {ROUNDS} rounds. {START_CREDITS} credits each. Seal an encrypted bid, shield it, sabotage a rival or gamble it all. The contract settles every round without seeing a single number.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              play('reveal')
              onPlay()
            }}
            className="btn-primary !min-h-[52px] !px-8 !text-base"
          >
            Play now <ArrowRight size={18} />
          </button>
          {SHADOW_ADDRESS && (
            <a
              href={buildAddressExplorerUrl(TARGET_CHAIN_ID, SHADOW_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost !min-h-[52px]"
            >
              <Gavel size={16} /> View contract
            </a>
          )}
        </motion.div>
      </section>

      <section aria-label="Live statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matches created" value={fmt(matches)} hint="read from the contract" />
        <Stat label="Matches completed" value={fmt(completed)} />
        <Stat label="Open lobbies" value={SHADOW_ADDRESS ? String(open) : '-'} hint="join one now" />
        <Stat label="In play" value={SHADOW_ADDRESS ? String(live) : '-'} />
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-3" aria-label="Why encrypted gameplay matters">
        {WHY.map(({ icon: Icon, title, body }, i) => (
          <motion.article
            key={title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="panel p-6"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-volt/30 to-pulse/20 text-pulse-soft">
              <Icon size={18} />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
          </motion.article>
        ))}
      </section>

      <div className="mt-10">
        <PrivacyMap />
      </div>
    </div>
  )
}
