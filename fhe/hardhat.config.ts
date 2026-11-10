import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import type { HardhatUserConfig } from "hardhat/config";

// Zama's supported FHE test environment: the FHEVM Hardhat plugin runs the real FHE library
// against the official host contracts (ACL, InputVerifier, KMSVerifier) with a mock coprocessor.
// Contracts are synced from ../contracts by `bun run test:fhe` (see package.json).
const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: { hardhat: { chainId: 31337 } },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  solidity: {
    version: "0.8.28",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  mocha: { timeout: 600000 },
};

export default config;
