#!/usr/bin/env bash
# Copies the game contracts next to the Hardhat project so Hardhat compiles only what the tests need.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf contracts && mkdir -p contracts
cp -r ../contracts/ShadowProtocol.sol ../contracts/ShadowStorage.sol ../contracts/ShadowRounds.sol ../contracts/interfaces ../contracts/mocks contracts/
