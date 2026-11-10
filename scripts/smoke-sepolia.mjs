/**
 * Live end-to-end check against the deployed contracts on Ethereum Sepolia.
 * Plays one real round with two wallets: real FHE encryption, real coprocessor, real KMS decryption.
 *
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/smoke-sepolia.mjs
 *
 * The key needs a little Sepolia ETH; a second wallet is generated and funded from it. Testnet only.
 */
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseEther, parseEventLogs, hexToBigInt } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk/node'

const abi = JSON.parse(readFileSync(new URL('../abi/ShadowProtocol.merged.json', import.meta.url), 'utf8'))
const deployment = JSON.parse(readFileSync(new URL('../deployments/sepolia.json', import.meta.url), 'utf8'))
const CORE = deployment.contracts.ShadowProtocol.address
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const pk = process.env.DEPLOYER_PRIVATE_KEY
if (!pk) throw new Error('Set DEPLOYER_PRIVATE_KEY (a funded Sepolia testnet key)')

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const A = privateKeyToAccount(pk)
const B = privateKeyToAccount(generatePrivateKey())
const wA = createWalletClient({ account: A, chain: sepolia, transport: http(RPC) })
const wB = createWalletClient({ account: B, chain: sepolia, transport: http(RPC) })

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
async function tx(wallet, functionName, args) {
  const hash = await wallet.writeContract({ address: CORE, abi, functionName, args, gas: 6_000_000n })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted (${hash})`)
  log(functionName, 'ok', hash)
  return receipt
}
async function retry(fn, label, tries = 12) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      log(label, 'not ready, retrying...', String(e.message ?? e).slice(0, 80))
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
  throw last
}

const fhe = await createInstance({ ...SepoliaConfig, network: RPC })

const created = parseEventLogs({ abi, eventName: 'MatchCreated', logs: (await tx(wA, 'createMatch', [2, 120])).logs })
const id = created[0].args.id
log('match', id.toString())

const fundHash = await wA.sendTransaction({ to: B.address, value: parseEther('0.002') })
await pub.waitForTransactionReceipt({ hash: fundHash })
await tx(wB, 'joinMatch', [id]) // table full -> seed generated in the FHE coprocessor

const seedHandle = await pub.readContract({ address: CORE, abi, functionName: 'seedHandle', args: [id] })
const seedRes = await retry(() => fhe.publicDecrypt([seedHandle]), 'seed decrypt')
const seed = hexToBigInt(seedRes.abiEncodedClearValues)
await tx(wA, 'revealSeed', [id, seed, seedRes.decryptionProof])
log('artifact points round 1:', await pub.readContract({ address: CORE, abi, functionName: 'artifactPoints', args: [id, 0] }))

async function submit(wallet, account, action, bid, power, target) {
  const input = fhe.createEncryptedInput(CORE, account.address)
  input.add32(action).add32(bid).add32(power).add32(target)
  const { handles, inputProof } = await input.encrypt()
  const hex = (u) => `0x${Buffer.from(u).toString('hex')}`
  await tx(wallet, 'submitMove', [id, hex(handles[0]), hex(handles[1]), hex(handles[2]), hex(handles[3]), hex(inputProof)])
}
await submit(wA, A, 0, 300, 0, 0) // A: BID 300
await submit(wB, B, 2, 200, 150, 0) // B: BID 200 + SABOTAGE 150 on A -> A effective 150 < 200, B wins

await tx(wA, 'closeRound', [id])
await tx(wA, 'applyRound', [id])

const winnerHandle = await pub.readContract({ address: CORE, abi, functionName: 'roundResultHandle', args: [id, 0] })
const win = await retry(() => fhe.publicDecrypt([winnerHandle]), 'winner decrypt')
const winner = Number(hexToBigInt(win.abiEncodedClearValues))
log('round winner slot (expected 1):', winner)

async function myCredits(account, wallet) {
  const [creditHandle] = await pub.readContract({ address: CORE, abi, functionName: 'getPlayerHandles', args: [id, account.address] })
  const kp = fhe.generateKeypair()
  const start = Math.floor(Date.now() / 1000)
  const eip = fhe.createEIP712(kp.publicKey, [CORE], start, 1)
  const sig = await wallet.signTypedData({
    account,
    domain: eip.domain,
    types: { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification },
    primaryType: 'UserDecryptRequestVerification',
    message: eip.message,
  })
  const res = await retry(
    () => fhe.userDecrypt([{ handle: creditHandle, contractAddress: CORE }], kp.privateKey, kp.publicKey, sig.replace('0x', ''), [CORE], account.address, start, 1),
    'user decrypt',
  )
  return res[creditHandle]
}
log('A credits (expected 1100):', await myCredits(A, wA))
log('B credits (expected 750):', await myCredits(B, wB))
log(winner === 1 ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED')
