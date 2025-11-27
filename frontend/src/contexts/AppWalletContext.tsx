import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Wallet, HDNodeWallet, JsonRpcProvider, Network } from 'ethers';

type WalletType = Wallet | HDNodeWallet;

interface AppWalletContextType {
    wallet: WalletType | null;
    address: string | null;
    isUnlocked: boolean;
    isWalletReady: boolean; // Wallet is fully loaded and ready
    isFhevmReady: boolean; // FHEVM instance is initialized
    ethBalance: bigint;
    isLoading: boolean;
    error: string | null;
    
    // Wallet management
    createWallet: (password: string) => Promise<void>;
    unlockWallet: (password: string) => Promise<void>;
    lockWallet: () => void;
    refreshBalance: () => Promise<void>;
    exportPrivateKey: (password: string) => Promise<string>;
    
    // Get wallet instance for signing
    getWallet: () => WalletType | null;
    getProvider: () => JsonRpcProvider | null;
}

const AppWalletContext = createContext<AppWalletContextType>({
    wallet: null,
    address: null,
    isUnlocked: false,
    isWalletReady: false,
    isFhevmReady: false,
    ethBalance: BigInt(0),
    isLoading: false,
    error: null,
    createWallet: async () => {},
    unlockWallet: async () => {},
    lockWallet: () => {},
    refreshBalance: async () => {},
    exportPrivateKey: async () => '',
    getWallet: () => null,
    getProvider: () => null,
});

const STORAGE_KEYS = {
    KEYSTORE: 'app_wallet_keystore',
    ADDRESS: 'app_wallet_address',
};

// Sepolia RPC endpoint (same as hardhat.config.ts)
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export const useAppWallet = () => useContext(AppWalletContext);

export const AppWalletProvider = ({ children }: { children: ReactNode }) => {
    const [wallet, setWallet] = useState<WalletType | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isWalletReady, setIsWalletReady] = useState(false);
    const [isFhevmReady, setIsFhevmReady] = useState(false);
    const [ethBalance, setEthBalance] = useState<bigint>(BigInt(0));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get provider for Sepolia
    const getProvider = useCallback(() => {
        // Create Sepolia network object
        const sepoliaNetwork = Network.from({
            name: 'sepolia',
            chainId: 11155111,
        });
        // Create provider with explicit network
        return new JsonRpcProvider(SEPOLIA_RPC, sepoliaNetwork, { staticNetwork: sepoliaNetwork });
    }, []);

    // Initialize FHEVM instance
    const initializeFhevm = useCallback(async () => {
        try {
            const { initializeFheInstance } = await import('../utils/fhevm');
            const instance = await initializeFheInstance();
            if (instance) {
                setIsFhevmReady(true);
            } else {
                console.warn('⚠️ FHEVM instance is null');
                setIsFhevmReady(false);
            }
        } catch (err: any) {
            console.error('❌ FHEVM initialization failed:', err);
            console.error('Error details:', err.message, err.stack);
            setIsFhevmReady(false);
            // Don't throw - FHEVM might need window.ethereum, but we should still try
        }
    }, []);
    
    // Create new wallet
    const createWallet = useCallback(async (password: string) => {
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        setIsLoading(true);
        setError(null);

        try {
            // Create random wallet
            const newWallet = Wallet.createRandom();
            
            // Encrypt wallet with password
            const encryptedJson = await newWallet.encrypt(password);
            
            // Save to localStorage
            localStorage.setItem(STORAGE_KEYS.KEYSTORE, encryptedJson);
            localStorage.setItem(STORAGE_KEYS.ADDRESS, newWallet.address);
            
            // Connect to provider
            const provider = getProvider();
            const connectedWallet = newWallet.connect(provider);
            
            // Set wallet state
            setWallet(connectedWallet);
            setAddress(newWallet.address);
            setIsUnlocked(true);
            setIsWalletReady(true); // Mark wallet as ready
            
            // Initialize FHEVM
            await initializeFhevm();
            
            // Refresh balance
            await refreshBalance();
        } catch (err: any) {
            setError(err.message || 'Failed to create wallet');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getProvider, initializeFhevm]);

    // Unlock wallet from localStorage
    const unlockWallet = useCallback(async (password: string) => {
        const keystore = localStorage.getItem(STORAGE_KEYS.KEYSTORE);
        const storedAddress = localStorage.getItem(STORAGE_KEYS.ADDRESS);

        if (!keystore || !storedAddress) {
            throw new Error('No wallet found. Please create a new wallet.');
        }

        setIsLoading(true);
        setError(null);

        try {
            // Decrypt wallet from keystore
            const decryptedWallet = await Wallet.fromEncryptedJson(keystore, password);
            
            // Verify address matches
            if (decryptedWallet.address.toLowerCase() !== storedAddress.toLowerCase()) {
                throw new Error('Wallet address mismatch');
            }
            
            // Connect to provider
            const provider = getProvider();
            const connectedWallet = decryptedWallet.connect(provider);
            
            // Set wallet state
            setWallet(connectedWallet);
            setAddress(decryptedWallet.address);
            setIsUnlocked(true);
            setIsWalletReady(true); // Mark wallet as ready
            
            // Initialize FHEVM
            await initializeFhevm();
            
            // Refresh balance
            await refreshBalance();
        } catch (err: any) {
            setError(err.message || 'Failed to unlock wallet. Wrong password?');
            setIsUnlocked(false);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getProvider, initializeFhevm]);
    
    // Lock wallet (remove from memory)
    const lockWallet = useCallback(() => {
        setWallet(null);
        setIsUnlocked(false);
        setIsWalletReady(false);
        setIsFhevmReady(false);
        setEthBalance(BigInt(0));
        // Keep keystore in localStorage, just remove from memory
    }, []);

    // Refresh ETH balance with retry logic
    const refreshBalance = useCallback(async () => {
        if (!address) {
            console.warn('refreshBalance: No address available');
            setEthBalance(BigInt(0));
            return;
        }

        // Try primary provider first
        try {
            const provider = getProvider();
            
            // Add timeout (increased to 20s for slow RPC)
            const balancePromise = provider.getBalance(address);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Balance fetch timeout')), 20000)
            );
            
            const balance = await Promise.race([balancePromise, timeoutPromise]) as bigint;
            setEthBalance(balance);
        } catch (err: any) {
            console.error('❌ Error refreshing balance:', err);
            console.error('Error details:', err.message);
        }
    }, [address, getProvider]);

    // Get wallet instance
    const getWallet = useCallback(() => {
        return wallet;
    }, [wallet]);

    // Export private key (requires password verification)
    const exportPrivateKey = useCallback(async (password: string): Promise<string> => {
        const keystore = localStorage.getItem(STORAGE_KEYS.KEYSTORE);
        const storedAddress = localStorage.getItem(STORAGE_KEYS.ADDRESS);

        if (!keystore || !storedAddress) {
            throw new Error('No wallet found');
        }

        if (!password) {
            throw new Error('Password is required');
        }

        try {
            // Decrypt wallet from keystore to verify password
            const decryptedWallet = await Wallet.fromEncryptedJson(keystore, password);
            
            // Verify address matches
            if (decryptedWallet.address.toLowerCase() !== storedAddress.toLowerCase()) {
                throw new Error('Wallet address mismatch');
            }
            
            // Return private key (with 0x prefix)
            return decryptedWallet.privateKey;
        } catch (err: any) {
            if (err.message.includes('incorrect password') || err.message.includes('wrong password')) {
                throw new Error('Incorrect password');
            }
            throw new Error(err.message || 'Failed to export private key');
        }
    }, []);

    // Check if wallet exists in localStorage on mount
    useEffect(() => {
        const storedAddress = localStorage.getItem(STORAGE_KEYS.ADDRESS);
        if (storedAddress) {
            setAddress(storedAddress);
        }
    }, []);

    // Auto refresh balance periodically
    useEffect(() => {
        if (isUnlocked && address) {
            refreshBalance();
            const interval = setInterval(refreshBalance, 10000); // Refresh every 10 seconds
            return () => clearInterval(interval);
        }
    }, [isUnlocked, address, refreshBalance]);

    return (
        <AppWalletContext.Provider
            value={{
                wallet,
                address,
                isUnlocked,
                isWalletReady,
                isFhevmReady,
                ethBalance,
                isLoading,
                error,
                createWallet,
                unlockWallet,
                lockWallet,
                refreshBalance,
                exportPrivateKey,
                getWallet,
                getProvider,
            }}
        >
            {children}
        </AppWalletContext.Provider>
    );
};

