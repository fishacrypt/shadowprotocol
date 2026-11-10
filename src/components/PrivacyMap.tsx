import { CheckCircle2, Eye, Lock, ShieldCheck } from 'lucide-react'
import { PrivacyBadge } from '@/components/ui'

const ENCRYPTED = [
  'Your action: bid, shield, sabotage, double or pass',
  'Your bid and tactic power',
  'Who you sabotage',
  'Your credit balance (only you can decrypt it)',
  'Your running score (until the match ends)',
  'Every intermediate calculation: effective bids, shields, penalties',
]

const PUBLIC = [
  'Who joined and who sealed a move (never what it contains)',
  'Round deadlines and match phase',
  'The artifact schedule, after the seed is revealed',
  'The round winner (a slot number, nothing about the bids)',
  'Final scores and the ranking',
]

const VERIFIABLE = [
  'The artifact seed is generated inside the FHE coprocessor and checked against KMS signatures onchain',
  'Final scores only count if the KMS signs the exact decrypted values',
  'The rules are open Solidity; moves cannot change after sealing',
  'Missed rounds and the 3-miss disqualification are public counters',
]

function Column({ title, tone, icon, items }: { title: string; tone: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="panel-inner p-4">
      <div className={`mb-3 flex items-center gap-2 font-display text-sm font-semibold ${tone}`}>
        {icon}
        {title}
      </div>
      <ul className="space-y-2 text-sm text-white/65">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/30" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PrivacyMap({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-labelledby="privacy-heading" className="panel p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Privacy interface</p>
          <h2 id="privacy-heading" className="font-display text-xl font-semibold text-white">What is hidden, what is public, what you can verify</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrivacyBadge state="encrypted" />
          <PrivacyBadge state="processing" />
          <PrivacyBadge state="revealed" />
          <PrivacyBadge state="verified" />
        </div>
      </div>
      <div className={compact ? 'grid gap-3 md:grid-cols-3' : 'grid gap-3 lg:grid-cols-3'}>
        <Column title="Encrypted (FHE)" tone="text-volt-soft" icon={<Lock size={16} />} items={ENCRYPTED} />
        <Column title="Public" tone="text-white" icon={<Eye size={16} />} items={PUBLIC} />
        <Column title="Independently verifiable" tone="text-emerald-300" icon={<ShieldCheck size={16} />} items={VERIFIABLE} />
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-white/40">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
        Shadow Protocol does not claim more than it implements: transactions still reveal that a player acted and when, and one person controlling several wallets in a match can coordinate against it.
      </p>
    </section>
  )
}
