import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { SoundToggle } from '@/components/ui'
import { TARGET_CHAIN_ID } from '@/lib/env'
import { play } from '@/lib/sfx'

export type View = 'landing' | 'lobby' | 'match' | 'profile'

const NAV: { id: View; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'profile', label: 'Profile' },
]

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="2" y1="2" x2="30" y2="30">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" stroke="url(#logo-g)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 9 L22 12.5 V19.5 L16 23 L10 19.5 V12.5 Z" fill="url(#logo-g)" opacity="0.9" />
    </svg>
  )
}

export function Header({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { isConnected, chainId } = useAccount()
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <button onClick={() => onNavigate('landing')} className="flex min-h-[44px] items-center gap-2.5" aria-label="Shadow Protocol home">
          <Logo />
          <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white">
            Shadow<span className="text-pulse"> Protocol</span>
          </span>
        </button>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                play('click')
                onNavigate(n.id)
              }}
              className={clsx(
                'min-h-[44px] rounded-lg px-4 font-display text-sm font-semibold transition-colors',
                view === n.id ? 'bg-white/[0.07] text-white' : 'text-white/50 hover:text-white',
              )}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <ConnectKitButton.Custom>
            {({ isConnected: connected, show, truncatedAddress, isConnecting }) => (
              <button onClick={show} className={connected ? 'btn-ghost !min-h-[40px]' : 'btn-primary !min-h-[40px]'}>
                {isConnecting ? 'Connecting wallet' : connected ? truncatedAddress : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
      <nav className="flex border-t border-white/[0.04] sm:hidden" aria-label="Primary mobile">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => onNavigate(n.id)}
            className={clsx('min-h-[44px] flex-1 font-display text-sm font-semibold', view === n.id ? 'text-pulse' : 'text-white/50')}
          >
            {n.label}
          </button>
        ))}
      </nav>
      {wrongChain && (
        <div className="flex items-center justify-center gap-2 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} /> Shadow Protocol runs on Ethereum Sepolia. Your wallet will be asked to switch before any action.
        </div>
      )}
    </header>
  )
}
