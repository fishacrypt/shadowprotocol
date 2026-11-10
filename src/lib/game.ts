import type { Address } from 'viem'

// Mirrors the constants in ShadowProtocol.sol. Rules are enforced onchain; these only drive the UI.
export const ROUNDS = 5
export const START_CREDITS = 1000
export const ROUND_INCOME = 100
export const PASS_BONUS = 150
export const MAX_MISSES = 3
export const NO_WINNER = 255

export const MIN_ROUND_SECONDS = 60
export const ROUND_DURATION_OPTIONS = [
  { label: '2 min', seconds: 120 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
]

export enum MatchState {
  Lobby = 0,
  AwaitingSeed = 1,
  Commit = 2,
  Resolving = 3,
  Finalizing = 4,
  Complete = 5,
  Cancelled = 6,
}

export const STATE_LABELS: Record<number, string> = {
  0: 'Waiting for players',
  1: 'Drawing artifact seed',
  2: 'Round open',
  3: 'Resolving round',
  4: 'Verifying final scores',
  5: 'Complete',
  6: 'Cancelled',
}

export enum Action {
  Bid = 0,
  Shield = 1,
  Sabotage = 2,
  Double = 3,
  Pass = 4,
}

export interface ActionDef {
  id: Action
  name: string
  short: string
  tradeoff: string
  usesBid: boolean
  usesPower: boolean
  powerLabel?: string
  usesTarget: boolean
}

export const ACTIONS: ActionDef[] = [
  {
    id: Action.Bid,
    name: 'Bid',
    short: 'Sealed offer',
    tradeoff: 'Highest effective bid wins and pays its bid. Losers keep their credits.',
    usesBid: true,
    usesPower: false,
    usesTarget: false,
  },
  {
    id: Action.Shield,
    name: 'Shield',
    short: 'Absorb sabotage',
    tradeoff: 'Burn credits to absorb that much incoming sabotage. Wasted if nobody attacks you.',
    usesBid: true,
    usesPower: true,
    powerLabel: 'Shield strength',
    usesTarget: false,
  },
  {
    id: Action.Sabotage,
    name: 'Sabotage',
    short: 'Cut a rival',
    tradeoff: 'Burn credits to cut a rival bid. A shield or a bad guess wastes them.',
    usesBid: true,
    usesPower: true,
    powerLabel: 'Sabotage strength',
    usesTarget: true,
  },
  {
    id: Action.Double,
    name: 'Double',
    short: 'Risk for 2x',
    tradeoff: 'Stake at least half your bid. Win: 2x points, stake back. Lose: stake burned, minus 1 point.',
    usesBid: true,
    usesPower: true,
    powerLabel: 'Stake',
    usesTarget: false,
  },
  {
    id: Action.Pass,
    name: 'Pass',
    short: 'Hold the line',
    tradeoff: `Spend nothing and earn a ${PASS_BONUS} credit rest bonus on top of income.`,
    usesBid: false,
    usesPower: false,
    usesTarget: false,
  },
]

export interface ArtifactDef {
  name: string
  points: number
  lore: string
}

// Same order and points as ShadowProtocol.artifactKind / artifactPoints.
export const ARTIFACTS: ArtifactDef[] = [
  { name: 'Ember Shard', points: 2, lore: 'A cooling fragment of a dead signal.' },
  { name: 'Veil Mirror', points: 3, lore: 'Shows every face except your own.' },
  { name: 'Null Crown', points: 4, lore: 'Worn by whoever nobody saw coming.' },
  { name: 'Echo Core', points: 5, lore: 'Repeats every secret it was never told.' },
  { name: 'Phantom Sigil', points: 3, lore: 'Appears only to its rightful bidder.' },
  { name: 'Singularity', points: 6, lore: 'Everything collapses toward it.' },
]

export interface MatchInfo {
  id: bigint
  creator: Address
  maxPlayers: number
  playerCount: number
  state: MatchState
  round: number
  roundDuration: number
  deadline: number
  createdAt: number
  seedRevealed: boolean
  prizeFunded: boolean
  submittedMask: number
  players: Address[]
}

export function shortAddress(a?: string): string {
  return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''
}

export function slotOf(match: MatchInfo, address?: Address): number {
  if (!address) return -1
  return match.players.findIndex((p) => p.toLowerCase() === address.toLowerCase())
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const rr = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${rr}` : `${mm}:${rr}`
}

/** Gradient avatar derived from an address (deterministic, no remote assets). */
export function avatarGradient(address: string): string {
  const n = parseInt(address.slice(2, 10), 16)
  const h1 = n % 360
  const h2 = (h1 + 70 + (n % 90)) % 360
  return `linear-gradient(135deg, hsl(${h1} 85% 58%), hsl(${h2} 85% 52%))`
}
