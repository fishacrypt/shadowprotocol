import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Header, type View } from '@/components/Header'
import { Landing } from '@/components/Landing'
import { Lobby } from '@/components/Lobby'
import { MatchRoom } from '@/components/MatchRoom'
import { Profile } from '@/components/Profile'

interface Route {
  view: View
  matchId?: bigint
}

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search)
  const m = params.get('match')
  if (m && /^\d+$/.test(m) && BigInt(m) > 0n) return { view: 'match', matchId: BigInt(m) }
  const v = params.get('view')
  if (v === 'lobby' || v === 'profile') return { view: v }
  return { view: 'landing' }
}

function toUrl(route: Route): string {
  if (route.view === 'match' && route.matchId) return `/?match=${route.matchId}`
  if (route.view === 'lobby' || route.view === 'profile') return `/?view=${route.view}`
  return '/'
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)

  useEffect(() => {
    const onPop = () => setRoute(readRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((next: Route) => {
    window.history.pushState(null, '', toUrl(next))
    setRoute(next)
    window.scrollTo({ top: 0 })
  }, [])

  const openMatch = useCallback((id: bigint) => go({ view: 'match', matchId: id }), [go])

  return (
    <div className="min-h-dvh">
      <Header view={route.view} onNavigate={(v) => go({ view: v })} />
      <AnimatePresence mode="wait">
        <motion.main key={route.view + (route.matchId?.toString() ?? '')} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {route.view === 'landing' && <Landing onPlay={() => go({ view: 'lobby' })} />}
          {route.view === 'lobby' && <Lobby onOpenMatch={openMatch} />}
          {route.view === 'match' && route.matchId !== undefined && <MatchRoom id={route.matchId} onBack={() => go({ view: 'lobby' })} />}
          {route.view === 'profile' && <Profile onOpenMatch={openMatch} />}
        </motion.main>
      </AnimatePresence>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-white/30">
        Shadow Protocol runs on Ethereum Sepolia with Zama FHEVM. Gameplay credits have no monetary value and are separate from the optional cUSDT prize.
      </footer>
    </div>
  )
}
