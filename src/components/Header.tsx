import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { SoundToggle } from '@/components/ui'
import { TARGET_CHAIN_ID } from '@/lib/env'
import { play } from '@/lib/sfx'

export type View = 'landing' | 'lobby' | 'match' | 'profile'

const NAV: { id: View; label: string }[] = [
  { id: 'lobby', label: 'Arena' },
  { id: 'profile', label: 'Player profile' },
]

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs><linearGradient id="logo-g" x1="2" y1="2" x2="30" y2="30"><stop offset="0" stopColor="#b5a0ff" /><stop offset="1" stopColor="#79e5ed" /></linearGradient></defs>
      <path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" stroke="url(#logo-g)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 8 L23 12 V20 L16 24 L9 20 V12 Z" stroke="url(#logo-g)" strokeWidth="1.2" />
      <path d="M16 13 L19.5 15 V18 L16 20 L12.5 18 V15 Z" fill="url(#logo-g)" />
    </svg>
  )
}

export function Header({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { isConnected, chainId } = useAccount()
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  return (
    <header className="sticky top-0 z-40 border-b border-white/[.07] bg-[#080d18]/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button onClick={() => onNavigate('landing')} className="group flex min-h-[44px] items-center gap-3" aria-label="Shadow Protocol home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] transition-colors group-hover:border-cyan-100/30"><Logo /></span>
          <span className="text-left"><span className="block font-display text-[13px] font-bold uppercase tracking-[.17em] text-white">Shadow Protocol</span><span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[.2em] text-white/35">Private strategy network</span></span>
        </button>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          <button onClick={() => onNavigate('landing')} className={clsx('min-h-[42px] rounded-full px-4 text-sm font-medium transition-colors', view === 'landing' ? 'text-white' : 'text-white/45 hover:text-white')}>Overview</button>
          {NAV.map((n) => <button key={n.id} onClick={() => { play('click'); onNavigate(n.id) }} className={clsx('min-h-[42px] rounded-full px-4 text-sm font-medium transition-colors', view === n.id ? 'bg-white/[.08] text-white' : 'text-white/45 hover:bg-white/[.04] hover:text-white')}>{n.label}</button>)}
        </nav>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <ConnectKitButton.Custom>{({ isConnected: connected, show, truncatedAddress, isConnecting }) => <button onClick={show} className={connected ? 'btn-ghost !min-h-[42px] !rounded-full !px-4' : 'btn-primary !min-h-[42px] !rounded-full !px-5'}>{isConnecting ? 'Connecting…' : connected ? truncatedAddress : 'Connect wallet'}<ChevronDown size={13} /></button>}</ConnectKitButton.Custom>
        </div>
      </div>
      <nav className="flex border-t border-white/[.05] bg-black/10 sm:hidden" aria-label="Primary mobile">
        {[{ id: 'landing' as View, label: 'Overview' }, ...NAV].map((n) => <button key={n.id} onClick={() => onNavigate(n.id)} className={clsx('min-h-[46px] flex-1 text-xs font-semibold', view === n.id ? 'text-cyan-100' : 'text-white/45')}>{n.label}</button>)}
      </nav>
      {wrongChain && <div className="flex items-center justify-center gap-2 bg-amber-300/10 px-4 py-2 text-xs text-amber-100"><AlertTriangle size={14} /> Switch to Ethereum Sepolia before taking an action.</div>}
    </header>
  )
}
