# 🎰 BlindJack

A privacy-preserving decentralized Blackjack game built with Zama's **FHE (Fully Homomorphic Encryption)** technology on the **Sepolia** testnet.

This project demonstrates how FHE enables private gaming where card values, bets, and game logic remain encrypted on-chain while players can still interact with and verify the game.

## 🔧 Technology Stack

This project is built with the latest compatible versions of the Zama ecosystem (as of January 2025):

### Backend (Contracts)
*   **Hardhat**: `^2.19.0`
*   **@fhevm/solidity**: `^0.9.1` (Supports Sepolia)
*   **@fhevm/hardhat-plugin**: `^0.3.0-1`

### Frontend
*   **React**: `^18.2.0`
*   **Vite**: `^5.2.0`
*   **Ethers**: `^6.11.1`
*   **react-hot-toast**: `^2.4.1`
*   **lucide-react**: `^0.554.0`
*   **Zama Relayer SDK**: `0.3.0-5` (Loaded via CDN, compatible with FHEVM 0.9)

### Core Technologies
*   **FHE (Fully Homomorphic Encryption)**: Enables computation on encrypted data without decryption
*   **FHEVM**: FHE-enabled Ethereum Virtual Machine for on-chain encrypted operations
*   **EIP-712**: Standard for typed structured data signing used for user decryption
*   **AES-128-CTR**: Symmetric encryption for wallet private key storage
*   **scrypt**: Password-based key derivation function for wallet security

## 🔐 Security Implementation

### Wallet Security Features

#### Encryption & Storage
*   **Private Key Encryption**: All private keys are encrypted using AES-128-CTR with scrypt key derivation before storage
*   **Password Protection**: Strong password requirements (minimum 6 characters) with scrypt-based verification
*   **Local Storage Only**: Encrypted keystore stored locally in browser - never transmitted to servers
*   **No Plaintext Storage**: Private keys are never stored or logged in unencrypted form

#### Access Control
*   **Password Verification**: All wallet operations require password authentication
*   **Auto-Lock Mechanism**: Wallet automatically locks on page refresh, browser close, or explicit lock action
*   **Memory Management**: Private keys only exist in memory during active use, cleared after operations
*   **Export Protection**: Private key export requires password re-verification

#### Operational Security
*   **Client-Side Operations**: All encryption/decryption performed client-side using Web Crypto APIs
*   **Ethers.js Security**: Uses industry-standard Ethers.js wallet encryption (compatible with MetaMask format)
*   **No Key Logging**: Private keys never appear in console logs or error messages

### FHE Game Security

#### Privacy Protection
*   **Encrypted Deck**: All 52 cards encrypted before shuffling using FHE
*   **Private Betting**: Bet amounts encrypted and stored as `euint32` on-chain
*   **Encrypted Calculations**: Card sums and game logic computed homomorphically
*   **Selective Disclosure**: Cards and results only decrypted by authorized players using EIP-712 signatures

#### On-Chain Privacy
*   **Publicly Decryptable Handles**: Game results made publicly decryptable only after game ends
*   **User-Controlled Decryption**: Players decrypt their own hands - dealer cards remain encrypted until end game
*   **No Plaintext On-Chain**: All sensitive game data remains encrypted throughout gameplay

## 💼 In-App Wallet System

The application includes a built-in wallet system that eliminates the need for external wallet providers.

### Security Measures Implemented

#### 🔐 Private Key Encryption
*   **AES-128-CTR Encryption**: Private keys are encrypted using Ethers.js keystore format (AES-128-CTR with scrypt key derivation)
*   **Password-Protected**: Encryption requires user password - private key is never stored in plaintext
*   **Secure Key Derivation**: Uses scrypt (N=32768, r=8, p=1) for password-based key derivation, making brute-force attacks computationally expensive

#### 💾 Secure Storage
*   **Encrypted Keystore**: Only encrypted JSON keystore is stored in browser `localStorage`
*   **No Plaintext Exposure**: Private keys are never written to storage in unencrypted form
*   **Memory Security**: Private keys only exist in memory when wallet is unlocked and actively used

#### 🔒 Access Control
*   **Password Verification**: Wallet unlock requires password verification using scrypt hashing
*   **Auto-Lock**: Wallet automatically locks on page refresh or browser close
*   **Export Protection**: Private key export requires password re-verification for security

#### 🛡️ Operational Security
*   **Local-Only Storage**: Wallet data never leaves the user's browser - no server-side storage
*   **Client-Side Encryption**: All encryption/decryption happens client-side using Web Crypto APIs
*   **No Network Transmission**: Private keys are never transmitted over the network

### Storage Structure

Wallet data stored in browser `localStorage`:
*   `app_wallet_keystore`: Encrypted JSON keystore (AES-128-CTR encrypted)
*   `app_wallet_address`: Wallet address (public information only)

### Security Best Practices for Users

*   **Strong Passwords**: Use complex passwords with mixed characters for better protection
*   **Password Storage**: Store your password securely - it cannot be recovered if lost
*   **Backup Private Key**: Export and securely store your private key as backup
*   **Testnet Use**: This application is designed for Sepolia testnet only - do not use mainnet funds
*   **Browser Security**: Use secure browsers and keep them updated
*   **Shared Devices**: Clear wallet data or use incognito mode when using shared computers

### Important Reminders

*   **Password**: If you lose your password, the wallet cannot be recovered. Store your password securely.
*   **Backup**: Export and backup your private key using the export function before using significant funds.
*   **Browser Data**: Clearing browser data will delete the wallet. Always export your private key as backup.
*   **Testnet Only**: This wallet system is designed for testnet use only.

## 🎮 Features

### Core Game Features
*   **Private Betting**: Bet amounts are encrypted on-chain using FHE
*   **Encrypted Card Dealing**: All 52 cards are encrypted before being dealt
*   **Private Hand Calculation**: Player and dealer sums are computed homomorphically without revealing actual values
*   **User Decryption**: Players can decrypt their own cards and hand values using EIP-712 signatures
*   **Dealer AI**: Automatic dealer turn that follows standard Blackjack rules (hits on < 17)
*   **Private Win/Loss**: Win conditions are computed in encrypted space and only revealed at game end

### Additional Features
*   **In-App Wallet**: Encrypted wallet stored locally (no MetaMask required)
*   **CHIP Token System**: Buy and sell CHIP tokens with ETH (1 ETH = 10,000 CHIP)
*   **Withdraw ETH**: Send ETH from app wallet to external wallet addresses
*   **Toast Notifications**: Real-time feedback for game actions and transactions
*   **Responsive UI**: Modern, beautiful interface built with Tailwind CSS

## 📦 Project Structure

The project consists of:
1.  **Contracts**: A Hardhat project containing the BlindJack Smart Contract
2.  **Frontend**: A React (Vite) application with in-app wallet and game interface

## 🛠️ Setup Instructions

### Prerequisites
*   Node.js (v18 or higher)
*   A wallet with Sepolia ETH for deployment
*   Basic understanding of FHE concepts

### 1. Contracts Setup

Navigate to the contracts directory:
```bash
cd contracts
npm install
```

**Environment Configuration:**
*   Create a `.env` file (template provided)
*   Fill in the `PRIVATE_KEY` of your deployer wallet (requires Sepolia ETH)

**Deploy to Sepolia:**
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

After successful deployment, the `FHEBlackjack.json` file (containing address and ABI) will be automatically saved to `frontend/src/deployments/`.

### 2. Frontend Setup

Navigate to the frontend directory:
```bash
cd ../frontend
npm install
```

**Install additional dependencies:**
```bash
npm install react-hot-toast
```

**Run the application:**
```bash
npm run dev
```

Access `http://localhost:5173` and start playing!

## 🎯 How It Works

### Game Flow

1. **Setup Wallet**: Create or unlock an in-app wallet (encrypted and stored locally)
2. **Buy CHIPs**: Exchange ETH for CHIP tokens (1 ETH = 10,000 CHIP)
3. **Place Bet**: Enter bet amount and start a new game
4. **Gameplay**:
   - Player receives 2 encrypted cards (decrypted on client-side)
   - Player can Hit (get another card) or Stand (end turn)
   - Dealer automatically plays according to Blackjack rules
5. **Game End**: 
   - Cards and results are made publicly decryptable
   - Winner is determined by comparing encrypted sums
   - Payouts are automatically processed

### Privacy Features

*   **Encrypted Deck**: All 52 cards are encrypted before shuffling
*   **Private Hands**: Card values remain encrypted until decrypted by the player
*   **Encrypted Calculations**: Sums and game logic computed in encrypted space
*   **Selective Disclosure**: Only relevant information is decrypted at game end

## 📝 Development Notes

*   **Auto-generated Deployments**: The frontend automatically reads the contract address from the JSON file generated by the deploy script. No manual copy-paste required.
*   **FHEVM Context**: The frontend uses `FhevmProvider` to manage connection state and SDK initialization.
*   **In-App Wallet**: The application includes a local encrypted wallet system, reducing dependency on external wallet providers.
*   **Batch Operations**: Card encryption and decryption operations are batched for efficiency.
*   **Gateway Synchronization**: The frontend includes retry logic and delays to handle FHE Gateway asynchronous updates.

## 🏗️ Build for Production

To build the frontend for production:

```bash
cd frontend
npm run build
```

The production-ready files will be in the `dist/` directory.

## ⚠️ Important Disclaimers

*   **Educational Purpose**: This is a demonstration project for learning FHE technology
*   **Testnet Only**: Designed and tested for Sepolia testnet - never use with mainnet ETH
*   **No Warranty**: Software provided "as-is" without warranties
*   **User Responsibility**: Users are responsible for securing their passwords and private keys

## 📄 License

This project is provided as-is for demonstration purposes.

## 🤝 Contributing

This is a template project. Feel free to fork and modify for your own use cases!

## 📚 Resources

*   [Zama Documentation](https://docs.zama.ai/)
*   [FHEVM GitHub](https://github.com/zama-ai/fhevm)
*   [Hardhat Documentation](https://hardhat.org/docs)
