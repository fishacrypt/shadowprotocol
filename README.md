# Shadow Protocol

**Your strategy is visible. Your secrets are not.**

Shadow Protocol is a multiplayer strategy game built around confidential computation. Two to four players compete across five rounds to claim a sequence of artifacts. Players submit sealed moves, while the smart contract compares bids and applies the game rules without exposing the underlying choices or balances.

The application runs on **Ethereum Sepolia** and uses **Zama FHEVM** for encrypted gameplay.

- **Live app:** https://shadowpro.vercel.app/
- **Network:** Ethereum Sepolia (chain ID `11155111`)
- **Players:** 2–4 per match
- **Match length:** 5 rounds
- **Starting balance:** 1,000 gameplay credits per player

> **Important:** Gameplay credits are simulated game points. They have no monetary value and cannot be withdrawn. The optional cUSDT prize is a separate testnet feature. This project is not audited and should not be used with real funds.

---

## How the game works

Each round features one artifact with a value between 2 and 6 points. Every player chooses one move and seals it as encrypted input. The contract evaluates the moves without revealing bids, tactics, balances, or running scores.

The available tactics are:

| Tactic | What it does | The trade-off |
|---|---|---|
| **Bid** | Submit a sealed offer for the artifact. The highest effective bid wins and pays its bid. | Players who do not win keep their credits. |
| **Shield** | Spend credits to absorb incoming sabotage. | The shield spend is burned, even if nobody attacks you. |
| **Sabotage** | Target a rival and spend credits to reduce their bid. | A shield or an incorrect target can waste the spend. |
| **Double** | Risk a stake of at least half your bid for a chance to double the artifact points. | A successful Double returns the stake; a failed one burns it and costs 1 point. |
| **Pass** | Sit out the contest for the round. | You spend nothing and receive a 150-credit rest bonus on top of round income. |

Your available balance is private. The contract caps spending at the credits you actually hold, even if the balance shown in the interface is not currently decrypted.

### Match rules at a glance

- A match supports 2, 3, or 4 players and runs for 5 rounds.
- Each player starts with 1,000 credits.
- Players who take part in a round receive 100 credits of round income. A player who misses the round is auto-passed and does not receive that income.
- The turn order used to break equal bids rotates each round.
- A player who misses 3 rounds becomes ineligible to win the prize.
- The highest final score wins. A tie shares the prize according to the contract rules.

See [the player guide](docs/PLAYING_GUIDE.md) for the full walkthrough.

---

## Privacy and verification

Shadow Protocol uses Fully Homomorphic Encryption (FHE) so the contract can compute over encrypted inputs.

| Data | Visibility |
|---|---|
| Action, bid, tactic power, and sabotage target | Encrypted |
| Credit balance and running score during the match | Encrypted |
| Who joined and who submitted a move | Public |
| Match phase, round deadline, and artifact schedule after seed reveal | Public |
| Round winner slot | Public |
| Final scores and ranking after finalization | Public |

### What is verifiable

- The artifact seed is generated through the FHE coprocessor and accepted onchain with a valid KMS signature.
- Final scores are only accepted when accompanied by the required signed decryption proof.
- The game rules and settlement logic are implemented in Solidity.
- Once a move is sealed, it cannot be edited.

### Privacy limitations

FHE hides the contents of a move, not the fact that a transaction happened. Observers can see which address submitted and when. Multiple wallets controlled by one person can also coordinate. The seed and authorized decryption flow rely on Zama's coprocessor and KMS trust assumptions.

---

## Technology and architecture

| Layer | Implementation |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling and motion | Tailwind CSS, Framer Motion |
| Wallet connection | wagmi, ConnectKit |
| Smart contracts | Solidity, Foundry |
| Confidential computation | Zama FHEVM and relayer SDK |
| Contract tests | Foundry and Zama Hardhat FHEVM plugin |
| Network | Ethereum Sepolia |

### Contract layout

| File | Responsibility |
|---|---|
| `contracts/ShadowProtocol.sol` | Match state, lobby, seed handling, finalization, and public views |
| `contracts/ShadowRounds.sol` | Encrypted round engine, prize escrow, and claims; reached through delegatecall |
| `contracts/ShadowStorage.sol` | Shared storage, events, errors, and artifact rules |
| `contracts/interfaces/IConfidentialToken.sol` | Confidential token interfaces |
| `contracts/mocks/MockConfidentialToken.sol` | Test-only confidential token implementation |
| `fhe/test/ShadowProtocol.test.ts` | FHE-focused contract tests |
| `src/lib/fhe.ts` | Frontend encryption and decryption helpers |
| `src/lib/game.ts` | Frontend game constants, labels, and types |
| `src/hooks/` | Contract reads, match state, and transaction flow |
| `src/components/` | Landing page, lobby, match room, board, actions, and results |

The contract logic is split across the protocol and rounds contracts to fit deployment constraints. The frontend interacts with the protocol address using the merged ABI at `abi/ShadowProtocol.merged.json`.

---

## Current Sepolia deployment

| Contract | Address | Deployment block |
|---|---|---:|
| ShadowProtocol | `0xd48eefC477a665ad6634E2bEfbC3114Ad86F65C0` | 12100699 |
| ShadowRounds | `0x7A39BdD3c5b1bD5C44054696C3d67205B1665A08` | 12100698 |

The deployed protocol uses Zama's documented Sepolia `cUSDTMock` wrapper:

- Confidential test token: `0x4E7B06D78965594eB5EF5414c357ca21E1554491`
- Underlying test USDT: `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0`

The underlying test token is publicly mintable on Sepolia. These are testnet assets, not mainnet funds. See [Zama's Sepolia contract addresses](https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia).

### Optional confidential prize

A match creator can optionally fund a prize after the match starts. The amount is encrypted and escrowed separately from gameplay credits.

1. The creator can use **Get test cUSDT** to mint public test USDT, approve the wrapper, and wrap it into confidential cUSDT.
2. The creator enters an amount and selects **Escrow prize**.
3. After the match is finalized, eligible winners can claim their share.
4. If no player is eligible, the creator can reclaim the escrow through the refund flow.

Prize funding is optional. A match can be played without it.

---

## Run locally

### Requirements

- [Bun](https://bun.sh/)
- [Foundry](https://getfoundry.sh/)
- Node.js 20 or later
- A browser wallet configured for Ethereum Sepolia

### Install and start

```bash
bun install
cp .env.example .env
bun run dev
```

Vite serves the app at [http://localhost:5173](http://localhost:5173).

### Build and checks

```bash
bun run build
bun run check
```

Contract and FHE test commands:

```bash
bun run contracts:build
bun run contracts:test
bun run test:fhe
```

The FHE test command syncs the Solidity sources into the Hardhat test workspace before running the Zama FHEVM tests.

### Environment variables

| Variable | Purpose |
|---|---|
| `VITE_SHADOW_PROTOCOL_ADDRESS` | Deployed ShadowProtocol address |
| `VITE_SHADOW_DEPLOY_BLOCK` | Deployment block used when scanning contract events |
| `VITE_PRIZE_TOKEN_ADDRESS` | ERC-7984 confidential prize token wrapper |
| `VITE_PRIZE_UNDERLYING_ADDRESS` | Underlying test token used by the test-token flow |
| `VITE_SEPOLIA_RPC_URL` | Frontend Sepolia RPC endpoint; optional if using the default |
| `DEPLOYER_PRIVATE_KEY` | Deployment and smoke-test scripts only; never expose as a `VITE_` variable |
| `SEPOLIA_RPC_URL` | Deployment and smoke-test RPC endpoint; optional |

Use the example file as a template. Never commit your private key or local `.env` file.

---

## Deploy your own contracts

Set a funded Sepolia deployer key and RPC endpoint in your local environment, then run:

```bash
bun run deploy:sepolia
```

The deployment script creates the contracts using the configured prize-token wrapper. Update the frontend `VITE_SHADOW_*` values to point to your deployment before building the frontend.

For a live encrypted smoke test:

```bash
bun run smoke:sepolia
```

The deployer wallet needs enough Sepolia ETH for contract deployment and transactions.

### Verify contracts

The repository includes Foundry verification commands. Set your Etherscan API key and use the addresses and constructor arguments from your deployment:

```bash
forge verify-contract <rounds-address> contracts/ShadowRounds.sol:ShadowRounds --chain sepolia --etherscan-api-key $ETHERSCAN_API_KEY

forge verify-contract <protocol-address> contracts/ShadowProtocol.sol:ShadowProtocol --chain sepolia --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address)" <prize-token-address> <rounds-address>)
```

The addresses above describe the current project deployment; verify the deployed source and constructor arguments before relying on a verification result.

---

## Frontend deployment

The production build is generated in `dist/`:

```bash
bun run build
```

The app can be hosted on Vercel or another static hosting provider. Configure the required `VITE_*` environment variables in the hosting dashboard and ensure application routes fall back to `index.html`.

The current public frontend is hosted at https://shadowpro.vercel.app/.

---

## Project status and limitations

- The live frontend has been manually opened and exercised: the landing page renders, wallet connection works, and the lobby, profile, and match flows have been explored.
- The contract suite includes FHE-focused tests and a Sepolia smoke-test script. A successful local test run should still be performed against the exact revision you deploy.
- Relayer and KMS availability affect encrypted operations. Decryption and round finalization may take longer when the services are busy.
- The contracts have not received an independent third-party audit.
- This is a Sepolia testnet project. Do not use it to custody or transfer real assets.

## License

No license has been specified yet. Contact the repository owner before reusing or distributing the code.
