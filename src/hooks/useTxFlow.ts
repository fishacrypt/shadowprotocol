import { useCallback, useRef, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWalletClient, useWriteContract } from 'wagmi'
import type { Abi, Address, Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem'
import { shadowAbi } from '@/lib/abi'
import { SHADOW_ADDRESS, TARGET_CHAIN_ID } from '@/lib/env'
import { parseError } from '@/lib/errors'
import { play } from '@/lib/sfx'

export type TxPhase =
  | 'idle'
  | 'connecting'
  | 'switching'
  | 'encrypting'
  | 'signing'
  | 'submitting'
  | 'processing'
  | 'decrypting'
  | 'done'
  | 'error'

export interface TxState {
  phase: TxPhase
  label: string
  hash?: Hex
  error?: string
}

export interface FlowContext {
  address: Address
  walletClient: WalletClient
  publicClient: PublicClient
  contract: Address
  set: (phase: TxPhase, label: string) => void
  /** Sign, broadcast and wait for a ShadowProtocol call. Throws if it reverts. */
  write: (functionName: string, args: readonly unknown[], label?: string) => Promise<TransactionReceipt>
  /** Same as write, for any other contract (token approvals, wrapping, confidential transfers). */
  send: (to: Address, abi: Abi, functionName: string, args: readonly unknown[], label?: string) => Promise<TransactionReceipt>
}

const IDLE: TxState = { phase: 'idle', label: '' }

export function useTxFlow() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [state, setState] = useState<TxState>(IDLE)
  const busy = useRef(false)

  const run = useCallback(
    async <T,>(task: (ctx: FlowContext) => Promise<T>): Promise<T | undefined> => {
      if (busy.current) return undefined
      busy.current = true
      try {
        const shadow = SHADOW_ADDRESS
        if (!shadow) throw new Error('not deployed')
        if (!isConnected || !address || !walletClient || !publicClient) {
          setState({ phase: 'connecting', label: 'Connect a wallet to continue' })
          throw new Error('wallet not connected')
        }
        if (walletClient.chain?.id !== TARGET_CHAIN_ID) {
          setState({ phase: 'switching', label: 'Switching to Ethereum Sepolia' })
          await switchChainAsync({ chainId: TARGET_CHAIN_ID })
        }
        const set = (phase: TxPhase, label: string) => setState((s) => ({ ...s, phase, label, error: undefined }))
        const send: FlowContext['send'] = async (to, abi, functionName, args, label) => {
          set('signing', label ?? 'Awaiting wallet signature')
          const hash = await writeContractAsync({
            address: to,
            abi,
            functionName,
            args: args,
            chainId: TARGET_CHAIN_ID,
          })
          setState({ phase: 'submitting', label: 'Submitting transaction', hash })
          const receipt = await (publicClient as PublicClient).waitForTransactionReceipt({ hash })
          if (receipt.status !== 'success') throw new Error('reverted')
          setState({ phase: 'processing', label: 'Confirmed. Encrypted computation finishing', hash })
          return receipt
        }
        const ctx: FlowContext = {
          address,
          walletClient,
          publicClient: publicClient,
          contract: shadow,
          set,
          write: (functionName, args, label) => send(shadow, shadowAbi, functionName, args, label),
          send,
        }
        const result = await task(ctx)
        setState((s) => ({ ...s, phase: 'done', label: 'Done', error: undefined }))
        return result
      } catch (err) {
        const parsed = parseError(err)
        if (parsed.cancelled) {
          setState(IDLE)
        } else {
          play('error')
          setState((s) => ({ phase: 'error', label: 'Failed', hash: s.hash, error: parsed.message }))
        }
        return undefined
      } finally {
        busy.current = false
      }
    },
    [address, isConnected, publicClient, switchChainAsync, walletClient, writeContractAsync],
  )

  const reset = useCallback(() => setState(IDLE), [])

  return { state, run, reset, busy: state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error' }
}
