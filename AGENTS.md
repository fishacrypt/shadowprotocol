# Shadow Protocol

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Multiplayer encrypted strategy game on Ethereum Sepolia using Zama FHEVM. Contracts, FHE tests, live Sepolia smoke test and React frontend.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```


## Deployed (Ethereum Sepolia, 11155111)

- ShadowProtocol: 0xd48eefC477a665ad6634E2bEfbC3114Ad86F65C0 (block 12100699), delegatecalls ShadowRounds
- ShadowRounds: 0x7A39BdD3c5b1bD5C44054696C3d67205B1665A08
- Prize token (Zama cUSDTMock wrapper): 0x4E7B06D78965594eB5EF5414c357ca21E1554491
- Deployed with a throwaway key because the platform deployer cannot afford ~16M gas per contract on Sepolia (code costs ~1.5k gas/byte). Each contract must stay under ~10.8 KB.
- Chain, not Arc: this project targets Ethereum Sepolia; the Arc starter config was replaced in `src/config.ts`.

## Notes for agents

- `bun run test:fhe` uses Hardhat in `fhe/` with TypeScript 5 aliased as `ts5` (the root uses TS 7 which ts-node cannot load).
- Clients use the merged ABI (`abi/ShadowProtocol.merged.json`, `src/lib/abi.ts`). Regenerate both after contract changes.
- Never decrypt balances in code paths that do not require the player's own wallet signature.
