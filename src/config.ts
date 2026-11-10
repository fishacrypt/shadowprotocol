/**
 * wagmi configuration - Shadow Protocol runs on Ethereum Sepolia (Zama FHEVM host chain).
 * Built with Arc Studio - https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

const envRpc = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined
export const SEPOLIA_RPC_URL: string = envRpc || sepolia.rpcUrls.default.http[0]

registerChain(sepolia.id, SEPOLIA_RPC_URL)

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
})
