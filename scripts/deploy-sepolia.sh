#!/usr/bin/env bash
# Deploys ShadowRounds then ShadowProtocol to Ethereum Sepolia with Foundry's cast.
# Usage: DEPLOYER_PRIVATE_KEY=0x... [SEPOLIA_RPC_URL=...] [PRIZE_TOKEN=0x...] bash scripts/deploy-sepolia.sh
# PRIZE_TOKEN defaults to Zama's documented Sepolia cUSDT test wrapper (set 0x0 to disable prize pools).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PRIZE_TOKEN="${PRIZE_TOKEN:-0x4E7B06D78965594eB5EF5414c357ca21E1554491}"

forge build >/dev/null
bytecode() { python3 -c "import json,sys;print(json.load(open('contracts/out/$1.sol/$1.json'))['bytecode']['object'])"; }

# Sepolia prices contract code at roughly 1,500 gas per byte, so each deploy needs ~16M gas.
# The shared platform deployer cannot afford that, so deploy with your own funded key.
echo "Deploying ShadowRounds..."
ROUNDS=$(cast send --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --gas-limit 16700000 --create "$(bytecode ShadowRounds)" --json | python3 -c "import json,sys;print(json.load(sys.stdin)['contractAddress'])")
echo "ShadowRounds: $ROUNDS"

echo "Deploying ShadowProtocol..."
CORE=$(cast send --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --gas-limit 16700000 --create "$(bytecode ShadowProtocol)" "constructor(address,address)" "$PRIZE_TOKEN" "$ROUNDS" --json | python3 -c "import json,sys;print(json.load(sys.stdin)['contractAddress'])")
echo "ShadowProtocol: $CORE"
echo "Put VITE_SHADOW_PROTOCOL_ADDRESS=$CORE in .env (and VITE_SHADOW_DEPLOY_BLOCK), then restart the dev server."
