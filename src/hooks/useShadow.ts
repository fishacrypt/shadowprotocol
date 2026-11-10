import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import type { Abi, AbiEvent, Address, Hex, PublicClient } from 'viem'
import { shadowAbi } from '@/lib/abi'
import { DEPLOY_BLOCK, SHADOW_ADDRESS, TARGET_CHAIN_ID } from '@/lib/env'
import { type MatchInfo, MatchState } from '@/lib/game'
import { publicDecrypt } from '@/lib/fhe'

const base = { address: SHADOW_ADDRESS, abi: shadowAbi, chainId: TARGET_CHAIN_ID } as const
const enabled = SHADOW_ADDRESS !== undefined

export function useProtocolStats() {
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { ...base, functionName: 'matchCount' },
      { ...base, functionName: 'completedMatches' },
    ],
    query: { enabled, refetchInterval: 10_000 },
  })
  return {
    matches: data?.[0]?.result,
    completed: data?.[1]?.result,
    isLoading,
    isError,
  }
}

interface RawMatch {
  creator: Address
  maxPlayers: number
  playerCount: number
  state: number
  round: number
  roundDuration: number
  deadline: bigint
  createdAt: bigint
  seedRevealed: boolean
  prizeFunded: boolean
  submittedMask: number
}

function toMatch(id: bigint, raw: unknown, players: unknown): MatchInfo | undefined {
  if (!raw || !players) return undefined
  const m = raw as RawMatch
  return {
    id,
    creator: m.creator,
    maxPlayers: Number(m.maxPlayers),
    playerCount: Number(m.playerCount),
    state: Number(m.state) as MatchState,
    round: Number(m.round),
    roundDuration: Number(m.roundDuration),
    deadline: Number(m.deadline),
    createdAt: Number(m.createdAt),
    seedRevealed: m.seedRevealed,
    prizeFunded: m.prizeFunded,
    submittedMask: Number(m.submittedMask),
    players: [...(players as readonly Address[])],
  }
}

export function useMatch(id: bigint | undefined) {
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: 'getMatch', args: [id ?? 0n] },
      { ...base, functionName: 'getPlayers', args: [id ?? 0n] },
    ],
    query: { enabled: enabled && id !== undefined, refetchInterval: 4_000 },
  })
  const match = useMemo(
    () => (id === undefined ? undefined : toMatch(id, data?.[0]?.result, data?.[1]?.result)),
    [id, data],
  )
  return { match, isLoading, isError: isError || data?.[0]?.status === 'failure', refetch }
}

export function useMatchList(limit = 24) {
  const { matches: count } = useProtocolStats()
  const ids = useMemo(() => {
    if (!count) return [] as bigint[]
    const out: bigint[] = []
    for (let i = count; i >= 1n && out.length < limit; i--) out.push(i)
    return out
  }, [count, limit])
  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...base, functionName: 'getMatch' as const, args: [id] as const },
      { ...base, functionName: 'getPlayers' as const, args: [id] as const },
    ]),
    query: { enabled: enabled && ids.length > 0, refetchInterval: 8_000 },
  })
  const list = useMemo(() => {
    if (!data) return [] as MatchInfo[]
    return ids
      .map((id, i) => toMatch(id, data[i * 2]?.result, data[i * 2 + 1]?.result))
      .filter((m): m is MatchInfo => m !== undefined)
  }, [data, ids])
  return { list, isLoading: isLoading && ids.length > 0, refetch, total: count }
}

export function useArtifact(id: bigint | undefined, round: number, ready: boolean) {
  const { data } = useReadContracts({
    contracts: [
      { ...base, functionName: 'artifactKind', args: [id ?? 0n, round] },
      { ...base, functionName: 'artifactPoints', args: [id ?? 0n, round] },
    ],
    query: { enabled: enabled && ready && id !== undefined, staleTime: Infinity },
  })
  const kind = data?.[0]?.result
  const points = data?.[1]?.result
  return kind === undefined || points === undefined ? undefined : { kind: Number(kind), points: Number(points) }
}

export function usePlayerStats(address?: Address) {
  const { data, isLoading } = useReadContract({
    ...base,
    functionName: 'stats',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: enabled && !!address, refetchInterval: 15_000 },
  })
  const s = data
  return {
    isLoading,
    stats: s ? { matches: Number(s[0]), wins: Number(s[1]), bestScore: Number(s[2]), totalScore: Number(s[3]) } : undefined,
  }
}

// ---------------------------------------------------------------------------
// Event scans (bounded, chunked, never from genesis)
// ---------------------------------------------------------------------------
const CHUNK = 5_000n
const FALLBACK_LOOKBACK = 20_000n

async function scanLogs(client: PublicClient, eventName: string, args?: Record<string, unknown>) {
  const event = (shadowAbi as Abi).find((i): i is AbiEvent => i.type === 'event' && i.name === eventName)
  if (!event) throw new Error(`Unknown event ${eventName}`)
  const head = await client.getBlockNumber()
  const start = DEPLOY_BLOCK ?? (head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n)
  const logs: Awaited<ReturnType<PublicClient['getLogs']>> = []
  for (let from = start; from <= head; from += CHUNK + 1n) {
    const to = from + CHUNK > head ? head : from + CHUNK
    const part = await client.getLogs({ address: SHADOW_ADDRESS, event, args: args as never, fromBlock: from, toBlock: to })
    logs.push(...part)
  }
  return logs
}

export interface FinalResult {
  scores: number[]
  winnersMask: number
}

export function useFinalResult(id: bigint | undefined, active: boolean) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  return useQuery({
    queryKey: ['final', id?.toString()],
    enabled: enabled && active && id !== undefined && !!client,
    staleTime: Infinity,
    queryFn: async (): Promise<FinalResult | null> => {
      const logs = await scanLogs(client as PublicClient, 'MatchFinalized', { id })
      const log = logs[logs.length - 1] as unknown as { args: { finalScores: readonly number[]; winnersMask: number } } | undefined
      if (!log) return null
      return { scores: log.args.finalScores.map(Number), winnersMask: Number(log.args.winnersMask) }
    },
  })
}

const winnerCache = new Map<string, number>()

/** KMS-verified winner slot of a resolved round (255 = nobody). Anyone can decrypt it. */
export function useRoundWinner(id: bigint | undefined, round: number, resolved: boolean) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  return useQuery({
    queryKey: ['winner', id?.toString(), round],
    enabled: enabled && resolved && id !== undefined && !!client,
    staleTime: Infinity,
    retry: 4,
    retryDelay: 2_500,
    queryFn: async (): Promise<number> => {
      const key = `${id}:${round}`
      const hit = winnerCache.get(key)
      if (hit !== undefined) return hit
      const handle = (await (client as PublicClient).readContract({
        address: SHADOW_ADDRESS as Address,
        abi: shadowAbi,
        functionName: 'roundResultHandle',
        args: [id as bigint, round],
      }))
      const { values } = await publicDecrypt([handle])
      const winner = Number(values[0])
      winnerCache.set(key, winner)
      return winner
    },
  })
}

export interface HistoryEntry {
  match: MatchInfo
  result: FinalResult | null
}

export function usePlayerHistory(address?: Address) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  return useQuery({
    queryKey: ['history', address?.toLowerCase()],
    enabled: enabled && !!address && !!client,
    refetchInterval: 30_000,
    queryFn: async (): Promise<HistoryEntry[]> => {
      const pc = client as PublicClient
      const joined = await scanLogs(pc, 'PlayerJoined', { player: address })
      const ids = [...new Set(joined.map((l) => (l as unknown as { args: { id: bigint } }).args.id))]
      const finals = await scanLogs(pc, 'MatchFinalized')
      const results = new Map<string, FinalResult>()
      for (const l of finals) {
        const a = (l as unknown as { args: { id: bigint; finalScores: readonly number[]; winnersMask: number } }).args
        results.set(a.id.toString(), { scores: a.finalScores.map(Number), winnersMask: Number(a.winnersMask) })
      }
      const entries: HistoryEntry[] = []
      for (const id of ids.slice(-30).reverse()) {
        const [m, players] = await Promise.all([
          pc.readContract({ address: SHADOW_ADDRESS as Address, abi: shadowAbi, functionName: 'getMatch', args: [id] }),
          pc.readContract({ address: SHADOW_ADDRESS as Address, abi: shadowAbi, functionName: 'getPlayers', args: [id] }),
        ])
        const match = toMatch(id, m, players)
        if (match) entries.push({ match, result: results.get(id.toString()) ?? null })
      }
      return entries
    },
  })
}
