import { useState } from 'react'
import { useAccount } from 'wagmi'
import { encodeAbiParameters, erc20Abi, parseUnits, type Abi } from 'viem'
import { Coins } from 'lucide-react'
import { TxBanner } from '@/components/ui'
import { useTxFlow } from '@/hooks/useTxFlow'
import { encryptAmount } from '@/lib/fhe'
import { PRIZE_TOKEN_ADDRESS, PRIZE_UNDERLYING_ADDRESS, SHADOW_ADDRESS } from '@/lib/env'
import { type MatchInfo, MatchState } from '@/lib/game'

const confidentialTokenAbi = [
  {
    type: 'function',
    name: 'confidentialTransferAndCall',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'encryptedAmount', type: 'bytes32' },
      { name: 'inputProof', type: 'bytes' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'wrap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const satisfies Abi

const mintAbi = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const satisfies Abi

/** Creator-only: escrow a confidential cUSDT prize. The amount is encrypted; the pool stays hidden. */
export function PrizePanel({ match }: { match: MatchInfo }) {
  const { address } = useAccount()
  const { state, run, reset, busy } = useTxFlow()
  const [amount, setAmount] = useState('100')

  const isCreator = !!address && address.toLowerCase() === match.creator.toLowerCase()
  const fundable = [MatchState.AwaitingSeed, MatchState.Commit, MatchState.Resolving].includes(match.state)
  if (!PRIZE_TOKEN_ADDRESS || !SHADOW_ADDRESS) return null

  const units = (() => {
    try {
      return parseUnits(amount || '0', 6)
    } catch {
      return 0n
    }
  })()

  async function getTestTokens() {
    await run(async (ctx) => {
      if (!PRIZE_UNDERLYING_ADDRESS || !PRIZE_TOKEN_ADDRESS) return
      await ctx.send(PRIZE_UNDERLYING_ADDRESS, mintAbi, 'mint', [ctx.address, units], 'Mint test USDT (public testnet mint)')
      await ctx.send(PRIZE_UNDERLYING_ADDRESS, erc20Abi, 'approve', [PRIZE_TOKEN_ADDRESS, units], 'Approve the wrapper')
      await ctx.send(PRIZE_TOKEN_ADDRESS, confidentialTokenAbi, 'wrap', [ctx.address, units], 'Wrap into confidential cUSDT')
    })
  }

  async function fund() {
    await run(async (ctx) => {
      if (!PRIZE_TOKEN_ADDRESS || !SHADOW_ADDRESS) return
      ctx.set('encrypting', 'Encrypting the prize amount')
      const enc = await encryptAmount(PRIZE_TOKEN_ADDRESS, ctx.address, units)
      const data = encodeAbiParameters([{ type: 'uint256' }], [match.id])
      await ctx.send(PRIZE_TOKEN_ADDRESS, confidentialTokenAbi, 'confidentialTransferAndCall', [SHADOW_ADDRESS, enc.handle, enc.inputProof, data], 'Awaiting wallet signature to escrow the prize')
    })
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        <Coins size={18} className="text-pulse" />
        <h3 className="text-lg font-semibold">Confidential cUSDT prize</h3>
      </div>
      {match.prizeFunded ? (
        <p className="mt-2 text-sm text-white/60">A prize is escrowed. Its size is encrypted: only the token contract and this game contract can work with it. Winners claim their share after the match.</p>
      ) : (
        <p className="mt-2 text-sm text-white/60">No prize escrowed. The match creator can add an encrypted cUSDT prize once the match has started.</p>
      )}
      {isCreator && fundable && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              aria-label="Prize amount in cUSDT"
              className="min-h-[44px] w-28 rounded-xl border border-white/10 bg-black/40 px-3 text-right font-display tabular-nums text-white focus:border-pulse focus:outline-none"
            />
            <span className="text-sm text-white/50">cUSDT</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || units === 0n} onClick={() => void getTestTokens()} className="btn-ghost">Get test cUSDT</button>
            <button disabled={busy || units === 0n} onClick={() => void fund()} className="btn-cyan">Escrow prize</button>
          </div>
          <p className="text-[11px] text-white/35">Testnet only: "Get test cUSDT" mints Zama's public test USDT and wraps it 1:1. Funding needs the confidential balance in your wallet.</p>
          <TxBanner state={state} onClose={reset} />
        </div>
      )}
    </div>
  )
}
