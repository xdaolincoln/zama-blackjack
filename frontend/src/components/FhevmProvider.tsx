import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeFheInstance } from '../utils/fhevm';
import { BrowserProvider } from 'ethers';

interface FhevmContextType {
    isInitialized: boolean;
    error: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    account: string | null;
}

const FhevmContext = createContext<FhevmContextType>({
    isInitialized: false,
    error: null,
    connect: async () => { },
    disconnect: () => { },
    account: null,
});

export const useFhevm = () => useContext(FhevmContext);

export const FhevmProvider = ({ children }: { children: ReactNode }) => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [account, setAccount] = useState<string | null>(null);

    const connect = async () => {
        if (!window.ethereum) {
            setError("Metamask not installed");
            return;
        }

        try {
            const provider = new BrowserProvider(window.ethereum);
            const accounts = await provider.send("eth_requestAccounts", []);
            setAccount(accounts[0]);

            await initializeFheInstance();
            setIsInitialized(true);
            setError(null);
        } catch (err: any) {
            console.error("FHEVM init error:", err);
            setError(err.message || "Failed to initialize FHEVM");
            setIsInitialized(false);
        }
    };

    const disconnect = () => {
        setAccount(null);
        setIsInitialized(false);
        setError(null);
    };

    useEffect(() => {
        // Auto connect if already authorized (MetaMask)
        if (window.ethereum) {
            window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
                if (accounts.length > 0) {
                    connect();
                } else {
                    // No MetaMask accounts, but try to init FHEVM anyway (for app wallet)
                    const initFHE = async () => {
                        try {
                            await initializeFheInstance();
                            setIsInitialized(true);
                            setError(null);
                        } catch (err: any) {
                            console.warn('⚠️ FHEVM auto-init failed (will retry when app wallet unlocks):', err.message);
                            // Don't set error - will retry when app wallet unlocks
                        }
                    };
                    initFHE();
                }
            });
        } else {
            // If no MetaMask, try to initialize FHEVM anyway (for app wallet)
            // FHEVM might still need window.ethereum, but we can try
            const initFHE = async () => {
                try {
                    await initializeFheInstance();
                    setIsInitialized(true);
                    setError(null);
                } catch (err: any) {
                    // Silently fail - FHEVM might need window.ethereum
                    console.warn('⚠️ FHEVM auto-init failed (will retry when app wallet unlocks):', err.message);
                }
            };
            initFHE();
        }
    }, []);

    return (
        <FhevmContext.Provider value={{ isInitialized, error, connect, disconnect, account }}>
            {children}
        </FhevmContext.Provider>
    );
};
