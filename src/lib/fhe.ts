/**
 * Zama relayer SDK wrapper: real FHE encryption in the browser, KMS public decryption and wallet-authorised
 * user decryption on Ethereum Sepolia. Nothing here is simulated.
 */
import { toHex, type Address, type Hex, type WalletClient } from 'viem'
import { SEPOLIA_RPC_URL } from '@/config'
import { TARGET_CHAIN_ID } from '@/lib/env'

type SdkModule = typeof import('@zama-fhe/relayer-sdk/bundle')
type Instance = Awaited<ReturnType<SdkModule['createInstance']>>

let instancePromise: Promise<Instance> | undefined

/** Lazily loads the WASM + public key. Retries on the next call if initialisation failed. */
export function getFhe(): Promise<Instance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const sdk = await import('@zama-fhe/relayer-sdk/bundle')
      await sdk.initSDK()
      return sdk.createInstance({ ...sdk.SepoliaConfig, network: SEPOLIA_RPC_URL })
    })().catch((err) => {
      instancePromise = undefined
      throw err
    })
  }
  return instancePromise
}

export interface MoveInput {
  action: number
  bid: number
  power: number
  target: number
}

export interface EncryptedMove {
  action: Hex
  bid: Hex
  power: Hex
  target: Hex
  inputProof: Hex
}

/** Encrypts the four move fields client-side and binds the proof to (contract, user). */
export async function encryptMove(contract: Address, user: Address, move: MoveInput): Promise<EncryptedMove> {
  const fhe = await getFhe()
  const input = fhe.createEncryptedInput(contract, user)
  input.add32(move.action).add32(move.bid).add32(move.power).add32(move.target)
  const { handles, inputProof } = await input.encrypt()
  return {
    action: toHex(handles[0]),
    bid: toHex(handles[1]),
    power: toHex(handles[2]),
    target: toHex(handles[3]),
    inputProof: toHex(inputProof),
  }
}

/** Encrypts a 64-bit amount (e.g. cUSDT) for a token contract. */
export async function encryptAmount(token: Address, user: Address, amount: bigint): Promise<{ handle: Hex; inputProof: Hex }> {
  const fhe = await getFhe()
  const input = fhe.createEncryptedInput(token, user)
  input.add64(amount)
  const { handles, inputProof } = await input.encrypt()
  return { handle: toHex(handles[0]), inputProof: toHex(inputProof) }
}

export interface PublicDecryption {
  values: bigint[]
  proof: Hex
}

/** Asks the KMS to publicly decrypt handles the contract marked as publicly decryptable. */
export async function publicDecrypt(handles: Hex[]): Promise<PublicDecryption> {
  const fhe = await getFhe()
  const res = await fhe.publicDecrypt(handles)
  const values = handles.map((h) => {
    const v = res.clearValues[h] ?? res.clearValues[h.toLowerCase() as Hex]
    if (v === undefined) throw new Error('Decryption result is missing a requested handle')
    return typeof v === 'bigint' ? v : BigInt(v)
  })
  return { values, proof: res.decryptionProof }
}

/** The KMS needs a moment after the coprocessor finishes; retry a few times before surfacing an error. */
export async function publicDecryptWithRetry(handles: Hex[], attempts = 6, delayMs = 3000): Promise<PublicDecryption> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await publicDecrypt(handles)
    } catch (err) {
      last = err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw last
}

interface DecryptSession {
  privateKey: string
  publicKey: string
  signature: string
  startTimestamp: number
  durationDays: number
  contracts: string[]
  user: string
}

const sessions = new Map<string, DecryptSession>()

/** One wallet signature authorises decrypting your own handles for a day. */
async function getSession(wallet: WalletClient, user: Address, contract: Address): Promise<DecryptSession> {
  const key = `${user.toLowerCase()}:${contract.toLowerCase()}`
  const cached = sessions.get(key)
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.startTimestamp + cached.durationDays * 86400 - 600 > now) return cached

  const fhe = await getFhe()
  const keypair = fhe.generateKeypair()
  const startTimestamp = now
  const durationDays = 1
  const eip712 = fhe.createEIP712(keypair.publicKey, [contract], startTimestamp, durationDays)
  const signature = await wallet.signTypedData({
    account: user,
    domain: {
      ...eip712.domain,
      chainId: BigInt(eip712.domain.chainId),
      verifyingContract: eip712.domain.verifyingContract,
    },
    types: { UserDecryptRequestVerification: [...eip712.types.UserDecryptRequestVerification] },
    primaryType: 'UserDecryptRequestVerification',
    message: {
      publicKey: eip712.message.publicKey,
      contractAddresses: [...eip712.message.contractAddresses] as Address[],
      startTimestamp: BigInt(eip712.message.startTimestamp),
      durationDays: BigInt(eip712.message.durationDays),
      extraData: eip712.message.extraData,
    },
  })
  const session: DecryptSession = {
    privateKey: keypair.privateKey,
    publicKey: keypair.publicKey,
    signature: signature.replace(/^0x/, ''),
    startTimestamp,
    durationDays,
    contracts: [contract],
    user,
  }
  sessions.set(key, session)
  return session
}

/** Decrypts handles the connected wallet is allowed to read (its own credits and score). */
export async function userDecrypt(
  wallet: WalletClient,
  user: Address,
  contract: Address,
  handles: Hex[],
): Promise<bigint[]> {
  const session = await getSession(wallet, user, contract)
  const fhe = await getFhe()
  const res = await fhe.userDecrypt(
    handles.map((handle) => ({ handle, contractAddress: contract })),
    session.privateKey,
    session.publicKey,
    session.signature,
    session.contracts,
    session.user,
    session.startTimestamp,
    session.durationDays,
  )
  return handles.map((h) => {
    const v = res[h] ?? res[h.toLowerCase() as Hex]
    if (v === undefined) throw new Error('You are not authorised to decrypt this value')
    return typeof v === 'bigint' ? v : BigInt(v)
  })
}

export function forgetDecryptSession(user: Address, contract: Address): void {
  sessions.delete(`${user.toLowerCase()}:${contract.toLowerCase()}`)
}

export { TARGET_CHAIN_ID }
