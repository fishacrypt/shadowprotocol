import { motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, EyeOff, Gavel, LockKeyhole, Scale, ShieldCheck, Swords, Workflow } from 'lucide-react'
import { CipherText } from '@/components/ui'
import { PrivacyMap } from '@/components/PrivacyMap'
import { useMatchList, useProtocolStats } from '@/hooks/useShadow'
import { MatchState, ROUNDS, START_CREDITS } from '@/lib/game'
import { SHADOW_ADDRESS, TARGET_CHAIN_ID } from '@/lib/env'
import { play } from '@/lib/sfx'
import { buildAddressExplorerUrl } from '@/onchain-facts'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="hero-stat">
      <p className="label">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-white sm:text-4xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  )
}

const PRINCIPLES = [
  { icon: EyeOff, number: '01', title: 'Private by default', body: 'Moves, bids, targets and running balances stay encrypted. Rivals can see that you acted, never the strategy you submitted.' },
  { icon: Workflow, number: '02', title: 'Computed in the open', body: 'The rules execute onchain while FHE keeps the inputs confidential. Outcomes are settled without exposing the underlying values.' },
  { icon: ShieldCheck, number: '03', title: 'Verifiable outcomes', body: 'KMS-signed decryption proofs are checked by the contract before the final leaderboard is accepted.' },
]

const STEPS = [
  { title: 'Create your table', body: 'Choose your player count and round timer. Invite others with a shareable match link.' },
  { title: 'Seal your strategy', body: 'Choose an action, commit your bid and submit encrypted inputs through your wallet.' },
  { title: 'Resolve the round', body: 'Anyone can trigger settlement. The contract compares encrypted values and applies the rules.' },
  { title: 'Verify the winner', body: 'At the end, signed scores are checked onchain and the final ranking is revealed.' },
]

export function Landing({ onPlay }: { onPlay: () => void }) {
  const { matches, completed, isLoading } = useProtocolStats()
  const { list } = useMatchList(30)
  const open = list.filter((m) => m.state === MatchState.Lobby).length
  const live = list.filter((m) => m.state >= MatchState.AwaitingSeed && m.state <= MatchState.Finalizing).length
  const fmt = (v?: bigint | number) => (v === undefined ? (isLoading ? '...' : '—') : v.toString())

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <section className="hero-shell relative mt-5 overflow-hidden sm:mt-8">
        <div aria-hidden className="hero-grid absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-[34rem] w-[34rem] rounded-full bg-violet-500/15 blur-[110px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 left-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-[100px]" />
        <div className="relative grid gap-12 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-16 lg:py-24">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-100/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-100/80">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.9)]" />
              A new kind of onchain strategy
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08, duration: .65 }} className="mt-7 max-w-3xl text-5xl font-bold leading-[.98] tracking-[-.055em] sm:text-7xl xl:text-[5.6rem]">
              Play the game.<br /><span className="hero-gradient-text">Keep your edge.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }} className="mt-7 max-w-xl text-base leading-7 text-slate-300/75 sm:text-lg">
              Shadow Protocol is a multiplayer strategy game where your moves stay encrypted, even while the blockchain verifies every outcome.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .28 }} className="mt-9 flex flex-wrap items-center gap-3">
              <button onClick={() => { play('reveal'); onPlay() }} className="btn-primary !min-h-[54px] !rounded-full !px-7 !text-base">
                Enter the protocol <ArrowRight size={17} />
              </button>
              {SHADOW_ADDRESS && <a href={buildAddressExplorerUrl(TARGET_CHAIN_ID, SHADOW_ADDRESS)} target="_blank" rel="noopener noreferrer" className="btn-ghost !min-h-[54px] !rounded-full !px-6">Explore contract <ArrowUpRight size={16} /></a>}
            </motion.div>
            <p className="mt-5 text-xs tracking-wide text-white/35">BUILT ON ZAMA FHEVM <span className="mx-2 text-white/15">/</span> ETHEREUM SEPOLIA</p>
          </div>
          <motion.div initial={{ opacity: 0, scale: .96, x: 12 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: .2, duration: .7 }} className="relative mx-auto w-full max-w-lg">
            <div className="protocol-visual relative aspect-[.92] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c1220]/80 p-5 shadow-[0_30px_100px_rgba(0,0,0,.5)] sm:p-7">
              <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle at 50% 42%, rgba(124,91,220,.24), transparent 48%), linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px)', backgroundSize: 'auto, 34px 34px, 34px 34px' }} />
              <div className="relative flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.2em] text-white/40"><span>Encrypted arena</span><span className="text-cyan-200/70">Live system</span></div>
              <div className="relative flex h-[72%] items-center justify-center">
                <div className="absolute h-64 w-64 rounded-full border border-violet-300/15" />
                <div className="absolute h-52 w-52 rounded-full border border-cyan-200/15 [transform:rotateX(68deg)]" />
                <div className="absolute h-40 w-40 rounded-full border border-violet-200/25 [transform:rotateY(68deg)]" />
                <div className="absolute h-28 w-28 rounded-full bg-violet-500/20 blur-2xl" />
                <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-cyan-100/25 bg-gradient-to-br from-violet-400/20 to-cyan-300/10 shadow-[0_0_70px_rgba(120,95,220,.25)]">
                  <LockKeyhole size={42} strokeWidth={1.2} className="text-cyan-100" />
                </div>
                {['top-12 left-8','top-24 right-8','bottom-16 left-10','bottom-10 right-12'].map((pos, i) => <div key={pos} className={`absolute ${pos} flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#151b2b] text-xs font-semibold text-white/70 shadow-xl`}>{['P1','P2','P3','P4'][i]}</div>)}
                <div className="absolute left-1/2 top-1/2 h-px w-[78%] -translate-x-1/2 -translate-y-1/2 rotate-[25deg] bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />
              </div>
              <div className="relative grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[.08] bg-black/30 p-3"><p className="text-[9px] uppercase tracking-[.16em] text-white/35">Player input</p><p className="mt-1 font-mono text-xs text-violet-200"><CipherText length={16} /></p></div>
                <div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[.04] p-3"><p className="text-[9px] uppercase tracking-[.16em] text-white/35">Contract status</p><p className="mt-1 flex items-center gap-1.5 text-xs text-cyan-100"><ShieldCheck size={13} /> Verified execution</p></div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/10 bg-[#121827]/95 px-4 py-3 shadow-2xl sm:block"><p className="text-[9px] uppercase tracking-[.18em] text-white/35">Your strategy</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white"><LockKeyhole size={14} className="text-cyan-200" /> Only yours to reveal</p></div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10 -mt-1 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[.08] bg-[#111827]/90 sm:grid-cols-4">
        <Stat label="Matches created" value={fmt(matches)} hint="onchain total" />
        <Stat label="Matches completed" value={fmt(completed)} />
        <Stat label="Open lobbies" value={SHADOW_ADDRESS ? String(open) : '—'} hint="ready to join" />
        <Stat label="In play" value={SHADOW_ADDRESS ? String(live) : '—'} />
      </section>

      <section className="section-space">
        <div className="section-kicker">THE DIFFERENCE</div>
        <div className="mb-8 grid gap-4 md:grid-cols-[.8fr_1.2fr] md:items-end">
          <h2 className="section-heading">Strategy should be<br /><span className="text-white/40">yours alone.</span></h2>
          <p className="max-w-xl text-sm leading-7 text-slate-300/60 md:justify-self-end">Public blockchains make it easy to verify transactions, but they also expose the information that makes strategy interesting. Fully Homomorphic Encryption changes that trade-off.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, number, title, body }, i) => <motion.article key={number} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .08 }} className="feature-card">
            <div className="flex items-center justify-between"><span className="text-xs font-mono text-white/25">{number} / 03</span><Icon size={19} className="text-cyan-100/80" /></div>
            <h3 className="mt-12 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-300/55">{body}</p>
          </motion.article>)}
        </div>
      </section>

      <section className="section-space">
        <div className="section-kicker">HOW IT WORKS</div>
        <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
          <div><h2 className="section-heading">Four steps.<br /><span className="text-white/40">Zero open hands.</span></h2><p className="mt-5 max-w-sm text-sm leading-7 text-slate-300/55">Every match follows a transparent sequence while the strategic information stays private.</p></div>
          <div className="divide-y divide-white/[.08] border-y border-white/[.08]">
            {STEPS.map((step, i) => <div key={step.title} className="grid gap-3 py-5 sm:grid-cols-[64px_1fr]"><span className="font-mono text-sm text-cyan-100/55">0{i + 1}</span><div><h3 className="font-display text-lg font-semibold text-white">{step.title}</h3><p className="mt-1 text-sm leading-6 text-slate-300/55">{step.body}</p></div></div>)}
          </div>
        </div>
      </section>

      <section className="section-space">
        <div className="rounded-[2rem] border border-cyan-100/15 bg-gradient-to-br from-violet-400/[.10] via-[#111827] to-cyan-300/[.06] p-7 sm:p-12">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><div className="section-kicker">READY WHEN YOU ARE</div><h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">The best move is the one they never see coming.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300/60">Create a private table, bring your rivals, and let the protocol handle the proof.</p></div><button onClick={() => { play('reveal'); onPlay() }} className="btn-primary !min-h-[54px] !rounded-full !px-7">Find a match <ArrowRight size={17} /></button></div>
        </div>
      </section>

      <div className="section-space !pt-4"><PrivacyMap /></div>
      <footer className="mt-16 flex flex-col gap-3 border-t border-white/[.08] pt-7 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between"><span className="font-display font-semibold uppercase tracking-[.16em] text-white/65">Shadow Protocol</span><span>Built on Zama FHEVM · Ethereum Sepolia</span><span>Gameplay credits have no monetary value. cUSDT prizes are optional.</span></footer>
    </div>
  )
}
