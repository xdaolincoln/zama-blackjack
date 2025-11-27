import { useState, useCallback } from 'react';
import { BrowserProvider, Contract, hexlify, formatEther } from 'ethers';
import { getFheInstance } from '../utils/fhevm';
import { useAppWallet } from '../contexts/AppWalletContext';

import FHEBlackjack from '../deployments/FHEBlackjack.json';

const CONTRACT_ADDRESS = FHEBlackjack.address;
const ABI = FHEBlackjack.abi;

export interface GameState {
    player: string;
    betAmount: bigint;
    deckIndex: number;
    phase: number; // 0: PlayerTurn, 1: DealerTurn, 2: GameEnding, 3: Completed
    exists: boolean;
    playerSumHandle: bigint;
    dealerSumHandle: bigint;
}

export interface PlayerCards {
    card1Handle: bigint;
    card2Handle: bigint;
}

export interface DealerCards {
    cardUpHandle: bigint;
    holeCardHandle: bigint;
}

export const useBlackjack = () => {
    const { getWallet, getProvider, isWalletReady, isFhevmReady } = useAppWallet();
    const [loading, setLoading] = useState(false);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [currentGameId, setCurrentGameId] = useState<number | null>(null);

    // Get contract instance - use app wallet signer if available, fallback to MetaMask
    const getContract = useCallback(async (withSigner = false) => {
        if (withSigner) {
            // Try app wallet first
            const appWallet = getWallet();
            if (appWallet) {
                // Ensure wallet is connected to provider
                const provider = getProvider();
                if (provider) {
                    const connectedWallet = appWallet.connect(provider);
                    return new Contract(CONTRACT_ADDRESS, ABI, connectedWallet);
                }
                // If no provider, wallet should already be connected
                return new Contract(CONTRACT_ADDRESS, ABI, appWallet);
            }
            
            // Fallback to MetaMask
            if (!window.ethereum) throw new Error('No wallet available');
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            return new Contract(CONTRACT_ADDRESS, ABI, signer);
        }
        
        // Read-only: use provider
        const provider = getProvider();
        if (provider) {
            return new Contract(CONTRACT_ADDRESS, ABI, provider);
        }
        
        // Fallback to MetaMask provider
        if (!window.ethereum) throw new Error('Ethereum provider not found');
        const metamaskProvider = new BrowserProvider(window.ethereum);
        return new Contract(CONTRACT_ADDRESS, ABI, metamaskProvider);
    }, [getWallet, getProvider]);

    // Get game state
    const getGameState = useCallback(async (gameId: number) => {
        try {
            const contract = await getContract(false);
            const state = await contract.getGameState(gameId);
            const gameStateData: GameState = {
                player: state.player,
                betAmount: state.betAmount,
                deckIndex: state.deckIndex,
                phase: state.phase,
                exists: state.exists,
                playerSumHandle: state.playerSumHandle,
                dealerSumHandle: state.dealerSumHandle,
            };
            setGameState(gameStateData);
            return gameStateData;
        } catch (error) {
            console.error('Error getting game state:', error);
            throw error;
        }
    }, [getContract]);

    // Start new game
    const startGame = useCallback(async (betAmount: number, account: string) => {
        // Check wallet ready state
        if (!isWalletReady) {
            console.error('❌ Wallet not ready:', { isWalletReady });
            throw new Error('App wallet not ready. Please wait...');
        }
        
        // Check FHEVM ready state - check AppWallet flag (primary)
        // isInitialized from FhevmProvider might be false if no MetaMask, but that's OK
        if (!isFhevmReady) {
            console.error('❌ FHEVM not ready (AppWallet):', { isFhevmReady });
            throw new Error('FHEVM not initialized. Please wait...');
        }
        
        // Also check if FHEVM instance exists
        const fheInstance = getFheInstance();
        if (!fheInstance) {
            console.error('❌ FHEVM instance not available');
            throw new Error('FHEVM instance not available. Please wait...');
        }
        
        if (!account) {
            console.error('❌ Account not available');
            throw new Error('Wallet address not available');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            console.error('❌ App wallet not available');
            throw new Error('App wallet not unlocked');
        }

        const instance = getFheInstance();
        if (!instance) {
            throw new Error('FHE instance not initialized');
        }

        setLoading(true);
        try {
            if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
                throw new Error('Contract not deployed! Please deploy the contract first.');
            }
            
            // Create encrypted deck (52 cards, values 1-13 for each suit)
            // Create a shuffled deck off-chain and encrypt it
            const deck: number[] = [];
            for (let i = 0; i < 52; i++) {
                // Card value: 1-13 (A, 2-10, J, Q, K)
                deck.push((i % 13) + 1);
            }
            
            // Shuffle the deck using Fisher-Yates algorithm
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            
            // Encrypt all 52 cards in a single batch (more efficient and correct for FHEVM)
            const input = instance.createEncryptedInput(CONTRACT_ADDRESS, account);
            for (let i = 0; i < 52; i++) {
                input.add8(deck[i]);
            }
            
            const { handles, inputProof } = await input.encrypt();
            
            // Convert handles to hex strings (handles can be Uint8Array, string, or bigint)
            const encryptedDeck = handles.map((h: any) => {
                if (typeof h === 'string') {
                    return h.startsWith('0x') ? h : '0x' + h;
                } else {
                    // Uint8Array or bigint → use hexlify
                    return hexlify(h);
                }
            });
            
            // Convert inputProof to hex if needed
            const attestationBytes = typeof inputProof === 'string' 
                ? (inputProof.startsWith('0x') ? inputProof : '0x' + inputProof)
                : hexlify(inputProof);
            
            // Validate bet amount
            if (betAmount <= 0) {
                throw new Error('Bet amount must be greater than 0');
            }
            
            // Encrypt bet amount (PRIVATE)
            const betInput = instance.createEncryptedInput(CONTRACT_ADDRESS, account);
            betInput.add32(betAmount);
            const { handles: betHandles, inputProof: betProof } = await betInput.encrypt();
            
            const encryptedBet = betHandles[0];
            const encryptedBetHex = typeof encryptedBet === 'string' 
                ? (encryptedBet.startsWith('0x') ? encryptedBet : '0x' + encryptedBet)
                : hexlify(encryptedBet);
            
            const betProofBytes = typeof betProof === 'string' 
                ? (betProof.startsWith('0x') ? betProof : '0x' + betProof)
                : hexlify(betProof);
            
            const contract = await getContract(true);
            const tx = await contract.startGame(
                encryptedDeck, 
                attestationBytes,
                encryptedBetHex,
                betProofBytes,
                betAmount // plainBet for balance check
            );
            await tx.wait();

            // Get game ID from nextGameId (will be the one we just created)
            const nextId = await contract.nextGameId();
            const gameId = Number(nextId) - 1;
            
            setCurrentGameId(gameId);
            await getGameState(gameId);

            return gameId;
        } catch (error: any) {
            console.error('Error starting game:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getGameState, getWallet]);

    // Player hit
    const hit = useCallback(async (gameId: number) => {
        if (!isFhevmReady) {
            throw new Error('FHEVM not initialized');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            
            // Try to estimate gas first
            try {
                await contract.hit.estimateGas(gameId);
            } catch (estimateError: any) {
                console.error('Gas estimation failed:', estimateError);
                throw new Error(`Gas estimation failed: ${estimateError.message || estimateError.reason || 'Unknown error'}`);
            }
            
            const tx = await contract.hit(gameId);
            await tx.wait();
            await getGameState(gameId);
            return tx;
        } catch (error: any) {
            console.error('Error hitting:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getGameState, getWallet]);

    // Player stand
    const stand = useCallback(async (gameId: number) => {
        if (!isFhevmReady) {
            throw new Error('FHEVM not initialized');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.stand(gameId);
            await tx.wait();
            await getGameState(gameId);
        } catch (error: any) {
            console.error('Error standing:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getGameState, getWallet]);

    // Dealer hit (called by off-chain logic)
    const dealerHit = useCallback(async (gameId: number) => {
        if (!isFhevmReady) {
            throw new Error('FHEVM not initialized');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.dealerHit(gameId);
            await tx.wait();
            await getGameState(gameId);
        } catch (error: any) {
            console.error('Error dealer hitting:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getGameState, getWallet]);

    // Set bust phase (when player busts)
    const setBustPhase = useCallback(async (gameId: number) => {
        if (!isFhevmReady) {
            throw new Error('FHEVM not initialized');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.setBustPhase(gameId);
            await tx.wait();
            await getGameState(gameId);
        } catch (error: any) {
            console.error('Error setting bust phase:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getGameState, getWallet]);

    // End game
    const endGame = useCallback(async (gameId: number) => {
        if (!isFhevmReady) {
            throw new Error('FHEVM not initialized');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.endGame(gameId);
            await tx.wait();
            await getGameState(gameId);
        } catch (error: any) {
            console.error('Error ending game:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getGameState, getWallet]);

    // Get player cards
    const getPlayerCards = useCallback(async (gameId: number): Promise<PlayerCards> => {
        try {
            const contract = await getContract(false);
            const cards = await contract.getPlayerCards(gameId);
            return {
                card1Handle: cards.card1Handle,
                card2Handle: cards.card2Handle,
            };
        } catch (error) {
            console.error('Error getting player cards:', error);
            throw error;
        }
    }, [getContract]);

    // Get dealer cards
    const getDealerCards = useCallback(async (gameId: number): Promise<DealerCards> => {
        try {
            const contract = await getContract(false);
            const cards = await contract.getDealerCards(gameId);
            return {
                cardUpHandle: cards.cardUpHandle,
                holeCardHandle: cards.holeCardHandle,
            };
        } catch (error) {
            console.error('Error getting dealer cards:', error);
            throw error;
        }
    }, [getContract]);

    // Get card from deck at specific index
    const getDeckCard = useCallback(async (gameId: number, index: number): Promise<bigint> => {
        try {
            const contract = await getContract(false);
            const cardHandle = await contract.getDeckCard(gameId, index);
            return cardHandle;
        } catch (error) {
            console.error('Error getting deck card:', error);
            throw error;
        }
    }, [getContract]);

    // Get bust flag handle
    const getBustFlag = useCallback(async (gameId: number): Promise<bigint> => {
        try {
            const contract = await getContract(false);
            const bustFlagHandle = await contract.getBustFlag(gameId);
            return bustFlagHandle;
        } catch (error) {
            console.error('Error getting bust flag:', error);
            throw error;
        }
    }, [getContract]);

    // Get win flag handle
    const getWinFlag = useCallback(async (gameId: number): Promise<bigint> => {
        try {
            const contract = await getContract(false);
            const winFlagHandle = await contract.getWinFlag(gameId);
            return winFlagHandle;
        } catch (error) {
            console.error('Error getting win flag:', error);
            throw error;
        }
    }, [getContract]);

    // Get continue flag handle
    const getContinueFlag = useCallback(async (gameId: number): Promise<bigint> => {
        try {
            const contract = await getContract(false);
            const continueFlagHandle = await contract.getContinueFlag(gameId);
            return continueFlagHandle;
        } catch (error) {
            console.error('Error getting continue flag:', error);
            throw error;
        }
    }, [getContract]);

    // Get bet amount handle (PRIVATE - encrypted)
    const getBetAmount = useCallback(async (gameId: number): Promise<bigint> => {
        try {
            const contract = await getContract(false);
            const betAmountHandle = await contract.getBetAmount(gameId);
            return betAmountHandle;
        } catch (error) {
            console.error('Error getting bet amount:', error);
            throw error;
        }
    }, [getContract]);

    // Payout winner (claim CHIP reward)
    const payoutWinner = useCallback(async (
        gameId: number,
        playerWon: boolean
    ) => {
        if (!isFhevmReady) {
            throw new Error('FHEVM not initialized');
        }
        
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.payoutWinner(gameId, playerWon);
            await tx.wait();
        } catch (error: any) {
            console.error('Error paying out winner:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [isFhevmReady, getContract, getWallet]);

    // Buy CHIP with ETH
    const buyChips = useCallback(async (ethAmount: bigint) => {
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.buyChips({ value: ethAmount });
            await tx.wait();
        } catch (error: any) {
            console.error('Error buying chips:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [getContract, getWallet]);

    // Sell CHIP for ETH
    const sellChips = useCallback(async (chipAmount: bigint) => {
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        setLoading(true);
        try {
            const contract = await getContract(true);
            const tx = await contract.sellChips(chipAmount);
            await tx.wait();
        } catch (error: any) {
            console.error('Error selling chips:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [getContract, getWallet]);

    // Get CHIP balance
    const getChipBalance = useCallback(async (userAddress: string) => {
        try {
            const contract = await getContract(false);
            if (!userAddress) return BigInt(0);
            const balance = await contract.chipBalances(userAddress);
            return balance;
        } catch (error) {
            console.error('Error getting chip balance:', error);
            return BigInt(0);
        }
    }, [getContract]);

    // Withdraw ETH from app wallet to external wallet (OEA)
    const withdrawEth = useCallback(async (ethAmount: bigint, toAddress: string) => {
        const appWallet = getWallet();
        if (!appWallet) {
            throw new Error('App wallet not unlocked');
        }

        // Validate address
        if (!toAddress || toAddress.length !== 42 || !toAddress.startsWith('0x')) {
            throw new Error('Invalid recipient address');
        }

        // Validate amount
        if (ethAmount <= 0) {
            throw new Error('Invalid amount');
        }

        setLoading(true);
        try {
            const provider = getProvider();
            if (!provider) {
                throw new Error('Provider not available');
            }

            // Connect wallet to provider
            const connectedWallet = appWallet.connect(provider);

            // Check balance
            const balance = await provider.getBalance(appWallet.address);
            if (balance < ethAmount) {
                throw new Error(`Insufficient ETH balance! You have ${formatEther(balance)} ETH, but need ${formatEther(ethAmount)} ETH.`);
            }

            // Send ETH transaction
            const tx = await connectedWallet.sendTransaction({
                to: toAddress,
                value: ethAmount,
            });

            await tx.wait();
        } catch (error: any) {
            console.error('Error withdrawing ETH:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [getWallet, getProvider]);

    return {
        loading,
        gameState,
        currentGameId,
        setCurrentGameId,
        startGame,
        hit,
        stand,
        dealerHit,
        setBustPhase,
        endGame,
        getGameState,
        getPlayerCards,
        getDealerCards,
        getDeckCard,
        getBustFlag,
        getWinFlag,
        getContinueFlag,
        getBetAmount,
        payoutWinner,
        buyChips,
        sellChips,
        getChipBalance,
        withdrawEth,
    };
};

