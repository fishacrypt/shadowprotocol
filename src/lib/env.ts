import { isAddress, type Address } from 'viem'
import { sepolia } from 'wagmi/chains'

const rawShadow = import.meta.env.VITE_SHADOW_PROTOCOL_ADDRESS as string | undefined
const rawToken = import.meta.env.VITE_PRIZE_TOKEN_ADDRESS as string | undefined
const rawUnderlying = import.meta.env.VITE_PRIZE_UNDERLYING_ADDRESS as string | undefined
const rawBlock = import.meta.env.VITE_SHADOW_DEPLOY_BLOCK as string | undefined

/** ShadowProtocol address on Sepolia. Undefined until VITE_SHADOW_PROTOCOL_ADDRESS is configured. */
export const SHADOW_ADDRESS: Address | undefined = rawShadow && isAddress(rawShadow) ? rawShadow : undefined

/** Confidential reward token (ERC-7984 cUSDT wrapper) the contract was deployed with. */
export const PRIZE_TOKEN_ADDRESS: Address | undefined = rawToken && isAddress(rawToken) ? rawToken : undefined
export const PRIZE_UNDERLYING_ADDRESS: Address | undefined =
  rawUnderlying && isAddress(rawUnderlying) ? rawUnderlying : undefined

/** Block the contract was deployed at: the earliest block any event scan needs to read. */
export const DEPLOY_BLOCK: bigint | undefined = rawBlock && /^\d+$/.test(rawBlock) ? BigInt(rawBlock) : undefined

export const TARGET_CHAIN = sepolia
export const TARGET_CHAIN_ID = sepolia.id
