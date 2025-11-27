import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

const RAW_PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const PRIVATE_KEY = RAW_PRIVATE_KEY.replace(/^0x/, "");

if (!process.env.PRIVATE_KEY) {
  throw new Error("Please set your PRIVATE_KEY in a .env file");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
      viaIR: true, // Enable IR-based code generation to avoid "Stack too deep" errors
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
};

export default config;
