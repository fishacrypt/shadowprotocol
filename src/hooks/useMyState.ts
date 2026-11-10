import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import type { Address, Hex, PublicClient } from 'viem'
import { shadowAbi } from '@/lib/abi'
import { SHADOW_ADDRESS, TARGET_CHAIN_ID } from '@/lib/env'
import { userDecrypt } from '@/lib/fhe'
import { parseError } from '@/lib/errors'

export interface MyState {
  credits?: number
  score?: number
  loading: boolean
  error?: string
}

/**
 * Your private credits and score. They are encrypted onchain; decrypting needs one wallet signature and only
 * works for the authorised player. Cleared whenever the round changes because the ciphertext changes.
 */
export function useMyState(matchId: bigint, round: number, enabledFlag: boolean) {
  const { address } = useAccount()
  const { data: wallet } = useWalletClient()
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  const key = `${matchId}:${round}:${address ?? ''}`
  const [stored, setStored] = useState<{ key: string; value: MyState }>({ key, value: { loading: false } })
  // A new round (or account) means new ciphertexts, so an older decrypted value no longer applies.
  const state: MyState = stored.key === key ? stored.value : { loading: false }
  const setState = (updater: MyState | ((s: MyState) => MyState)) =>
    setStored((prev) => {
      const base = prev.key === key ? prev.value : { loading: false }
      return { key, value: typeof updater === 'function' ? updater(base) : updater }
    })

  const reveal = useCallback(async () => {
    if (!enabledFlag || !address || !wallet || !client || !SHADOW_ADDRESS) return
    setState((s) => ({ ...s, loading: true, error: undefined }))
    try {
      const [credit, score] = (await (client as PublicClient).readContract({
        address: SHADOW_ADDRESS,
        abi: shadowAbi,
        functionName: 'getPlayerHandles',
        args: [matchId, address],
      }))
      const [c, s] = await userDecrypt(wallet, address, SHADOW_ADDRESS, [credit, score])
      setState({ loading: false, credits: Number(c), score: Number(s) })
    } catch (err) {
      const parsed = parseError(err)
      setState({ loading: false, error: parsed.cancelled ? undefined : parsed.message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, client, enabledFlag, matchId, wallet, key])

  return { ...state, reveal }
}
