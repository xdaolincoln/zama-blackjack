import { useState, useEffect } from 'react';
import { useBlackjack } from '../hooks/useBlackjack';
import { useFhevm } from '../components/FhevmProvider';
import { useAppWallet } from '../contexts/AppWalletContext';
import { reencrypt, reencryptMultiple, publicDecrypt, publicDecryptMultiple } from '../utils/fhevm';
import FHEBlackjack from '../deployments/FHEBlackjack.json';
import { Lock, RotateCcw, Copy, ChevronDown, LogOut } from 'lucide-react';
import { PlayingCard } from './PlayingCard';
import { ChipsModal } from './ChipsModal';
import { WalletSetupModal } from './WalletSetupModal';
import { WalletUnlockModal } from './WalletUnlockModal';
import { ExportPrivateKeyModal } from './ExportPrivateKeyModal';
import { showToast } from './Toast';

const CONTRACT_ADDRESS = FHEBlackjack.address;

export const BlackjackGame = () => {
    const { isInitialized } = useFhevm();
    const { 
        address: appWalletAddress, 
        isUnlocked: isAppWalletUnlocked, 
        isWalletReady,
        isFhevmReady,
        lockWallet,
        getWallet,
        ethBalance,
        refreshBalance: refreshEthBalance
    } = useAppWallet();
    
    // Use app wallet address as account, fallback to null
    const account = isAppWalletUnlocked ? appWalletAddress : null;
    
    // Get app wallet signer for FHE operations
    const getAppWalletSigner = () => {
        return isAppWalletUnlocked ? getWallet() : null;
    };
    
    // Wallet setup/unlock state
    const [showWalletSetup, setShowWalletSetup] = useState(false);
    const [showWalletUnlock, setShowWalletUnlock] = useState(false);
    const [showExportPrivateKey, setShowExportPrivateKey] = useState(false);
    
    // Check if wallet needs setup or unlock on mount
    useEffect(() => {
        if (!appWalletAddress) {
            // No wallet exists, show setup
            setShowWalletSetup(true);
        } else if (!isAppWalletUnlocked) {
            // Wallet exists but not unlocked, show unlock
            setShowWalletUnlock(true);
        }
    }, [appWalletAddress, isAppWalletUnlocked]);
    
    // Refresh ETH balance when wallet is unlocked
    useEffect(() => {
        if (isAppWalletUnlocked && appWalletAddress) {
            refreshEthBalance();
        }
    }, [isAppWalletUnlocked, appWalletAddress, refreshEthBalance]);
    const {
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
        payoutWinner,
        buyChips,
        sellChips,
        getChipBalance,
        withdrawEth,
    } = useBlackjack();

    const [playerSum, setPlayerSum] = useState<number | null>(null);
    const [dealerSum, setDealerSum] = useState<number | null>(null);
    const [playerCard1, setPlayerCard1] = useState<number | null>(null);
    const [playerCard2, setPlayerCard2] = useState<number | null>(null);
    const [dealerCardUp, setDealerCardUp] = useState<number | null>(null);
    const [dealerHoleCard, setDealerHoleCard] = useState<number | null>(null);
    const [dealerCards, setDealerCards] = useState<number[]>([]); // Track all dealer cards (cardUp, holeCard, and cards drawn in dealerHit)
    const [winFlag, setWinFlag] = useState<number | null>(null);
    const [playerCards, setPlayerCards] = useState<number[]>([]); // Track all player cards (values only)
    const [playerCardDeckIndices, setPlayerCardDeckIndices] = useState<number[]>([]); // Track deck indices for each player card
    const [playerCardsDecrypted, setPlayerCardsDecrypted] = useState<boolean>(false); // Track if player cards have been decrypted
    const [chipBalance, setChipBalance] = useState<bigint>(BigInt(0));
    const [betAmount, setBetAmount] = useState<string>('');
    const [isCashierOpen, setIsCashierOpen] = useState(false);
    const [isStartingGame, setIsStartingGame] = useState(false);
    const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false);
    const [isDecryptingResult, setIsDecryptingResult] = useState(false); // Track if we're decrypting final result
    const [actionInProgress, setActionInProgress] = useState(false); // Track if any action (hit/stand/start) is in progress (including decrypt)

    // Helper function to format chip balance
    const formatChipBalance = (balance: bigint): string => {
        return balance.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    // Helper function to format address (shorten)
    const formatAddress = (address: string | null): string => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Copy address to clipboard
    const copyAddress = async () => {
        if (!account) return;
        try {
            await navigator.clipboard.writeText(account);
        } catch (error) {
            console.error('Failed to copy address:', error);
        }
    };

    // Handle disconnect (lock app wallet)
    const handleDisconnect = () => {
        lockWallet();
        setIsWalletDropdownOpen(false);
        setCurrentGameId(null);
        // Reset game state
        setPlayerSum(null);
        setDealerSum(null);
        setPlayerCard1(null);
        setPlayerCard2(null);
        setDealerCardUp(null);
        setDealerHoleCard(null);
        setDealerCards([]);
        setWinFlag(null);
        setPlayerCards([]);
        setIsDecryptingResult(false);
        setChipBalance(BigInt(0));
        setActionInProgress(false); // ✅ Reset action flag to prevent stuck state
        // Show unlock modal again
        setShowWalletUnlock(true);
    };

    // Auto-close modal on transaction finish
    useEffect(() => {
        if (!loading && isCashierOpen) {
            setIsCashierOpen(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            // Check if click is outside the dropdown and wallet button
            if (isWalletDropdownOpen && 
                !target.closest('[data-wallet-dropdown]') && 
                !target.closest('[data-wallet-button]')) {
                setIsWalletDropdownOpen(false);
            }
        };

        if (isWalletDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isWalletDropdownOpen]);

    // Refresh game state (don't auto-decrypt to avoid auto-opening wallet)
    useEffect(() => {
        if (currentGameId && isInitialized && account) {
            refreshGameState();
        }
    }, [currentGameId, isInitialized, account]);

    const refreshChipBalance = async () => {
        if (!account) return;
        try {
            const balance = await getChipBalance(account);
            setChipBalance(balance);
        } catch (error) {
            console.error('Error refreshing chip balance:', error);
        }
    };

    // Refresh CHIP balance
    useEffect(() => {
        if (account && isInitialized) {
            refreshChipBalance();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account, isInitialized]);

    const refreshGameState = async () => {
        if (!currentGameId) return;
        try {
            await getGameState(currentGameId);
        } catch (error) {
            console.error('Error refreshing game state:', error);
        }
    };

    // Decrypt player sum
    const decryptPlayerSum = async (gameId?: number) => {
        const targetGameId = gameId || currentGameId;
        if (!account || !targetGameId) {
            console.warn('decryptPlayerSum: Missing account or gameId', { account, gameId: targetGameId });
            return null;
        }
        
        // Refresh gameState to get latest playerSumHandle
        await refreshGameState();
        
        // Get fresh gameState after refresh
        const freshState = await getGameState(targetGameId);
        if (!freshState?.playerSumHandle) {
            console.warn('decryptPlayerSum: Missing playerSumHandle after refresh', { 
                playerSumHandle: freshState?.playerSumHandle, 
                account,
                gameId: targetGameId 
            });
            return null;
        }
        
        try {
            const signer = getAppWalletSigner();
            const value = await reencrypt(freshState.playerSumHandle, CONTRACT_ADDRESS, account, signer || undefined);
            const sumNum = Number(value);
            setPlayerSum(sumNum);
            return sumNum;
        } catch (error) {
            console.error('Error decrypting player sum:', error);
            throw error; // Re-throw to let caller know it failed
        }
    };

    // Decrypt player cards
    const decryptPlayerCards = async (gameId?: number) => {
        const targetGameId = gameId || currentGameId;
        if (!targetGameId || !account) {
            console.warn('decryptPlayerCards: Missing gameId or account', { gameId: targetGameId, account });
            return { card1: null, card2: null };
        }
        try {
            const cards = await getPlayerCards(targetGameId);
            const signer = getAppWalletSigner();
            
            // Use reencryptMultiple to decrypt both cards with a single signature
            const [card1Value, card2Value] = await reencryptMultiple(
                [cards.card1Handle, cards.card2Handle],
                CONTRACT_ADDRESS,
                account!,
                signer || undefined
            );
            
            const card1Num = Number(card1Value);
            const card2Num = Number(card2Value);
            setPlayerCard1(card1Num);
            setPlayerCard2(card2Num);
            // Update playerCards array with initial 2 cards
            // Deck indices: card1 = 0, card2 = 1 (from contract: deck[0] and deck[1])
            setPlayerCards([card1Num, card2Num]);
            setPlayerCardDeckIndices([0, 1]);
            setPlayerCardsDecrypted(true); // Mark cards as decrypted
            
            return { card1: card1Num, card2: card2Num };
        } catch (error) {
            console.error('Error decrypting player cards:', error);
            throw error; // Re-throw to let caller know it failed
        }
    };

    // Decrypt dealer card up (publicly decryptable, no signature needed)
    const decryptDealerCardUp = async (gameId?: number) => {
        const targetGameId = gameId || currentGameId;
        if (!targetGameId) {
            console.warn('decryptDealerCardUp: Missing gameId');
            return;
        }
        try {
            const cards = await getDealerCards(targetGameId);
            if (!cards.cardUpHandle) {
                return;
            }
            const cardUpValue = await publicDecrypt(cards.cardUpHandle);
            const cardUpNum = Number(cardUpValue);
            setDealerCardUp(cardUpNum);
        } catch (error) {
            console.error('Error decrypting dealer card up:', error);
            throw error; // Re-throw to let caller know it failed
        }
    };

    // Handle start game
    const handleStartGame = async () => {
        // Set loading state FIRST, before any validation or async operations
        // This ensures UI updates immediately when button is clicked
        setIsStartingGame(true);
        setActionInProgress(true); // ⛔ Khóa tất cả nút actions
        
        // Use requestAnimationFrame + setTimeout to ensure React state is flushed
        // and UI is updated before starting heavy operations
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 0);
            });
        });
        
        if (!account) {
            setIsStartingGame(false);
            return;
        }
        
        // Validate bet amount
        const betNum = parseInt(betAmount);
        if (!betAmount || isNaN(betNum) || betNum <= 0) {
            setIsStartingGame(false);
            return;
        }
        
        // Check CHIP balance
        if (chipBalance < BigInt(betNum)) {
            setIsStartingGame(false);
            return;
        }
        
        // Check ETH balance for gas (rough estimate: need at least 0.001 ETH for gas)
        const minEthForGas = BigInt('1000000000000000'); // 0.001 ETH in wei
        if (ethBalance < minEthForGas) {
            setIsStartingGame(false);
            return;
        }
        
        try {
            // Reset state
            setPlayerSum(null);
            setDealerSum(null);
            setPlayerCard1(null);
            setPlayerCard2(null);
            setDealerCardUp(null);
            setDealerHoleCard(null);
            setDealerCards([]);
            setWinFlag(null);
            setPlayerCards([]);
            setPlayerCardDeckIndices([]);
            setPlayerCardsDecrypted(false);
            setIsDecryptingResult(false);
            
            const gameId = await startGame(betNum, account!);
            
            // Set placeholder cards to show face-down cards immediately
            // These will be updated with real values after decryption
            setPlayerCard1(0); // Placeholder value
            setPlayerCard2(0); // Placeholder value
            setPlayerCards([0, 0]); // Placeholder values
            setPlayerCardDeckIndices([0, 1]); // Deck indices for first 2 cards
            setPlayerCardsDecrypted(false); // Show face-down until decrypted
            
            // Refresh balance after game starts (bet was deducted)
            await refreshChipBalance();
            
            // Set current game ID so decrypt functions can use it
            setCurrentGameId(gameId);
            
            // Wait for transaction to be mined and Gateway to update
            await new Promise(resolve => setTimeout(resolve, 2000));
            await refreshGameState();
            
            // Wait a bit more for Gateway to process the new handles
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Auto decrypt: Player cards and sum (userDecrypt - requires signature)
            try {
                await decryptPlayerCards(gameId);
            } catch (error: any) {
                console.error('Error auto-decrypting player cards:', error);
            }
            
            try {
                await refreshGameState();
                await decryptPlayerSum(gameId);
            } catch (error: any) {
                console.error('Error auto-decrypting player sum:', error);
            }
            
            // Auto decrypt: Dealer cards (publicDecrypt - no signature needed)
            try {
                await decryptDealerCardUp(gameId);
                await decryptDealerHoleCard();
            } catch (error: any) {
                console.error('Error auto-decrypting dealer cards:', error);
            }
        } catch (error: any) {
            console.error('Start game error:', error);
        } finally {
            setIsStartingGame(false);
            setActionInProgress(false); // ✅ Mở lại nút sau khi hoàn thành (bao gồm decrypt)
        }
    };

    // Handle hit
    const handleHit = async () => {
        if (!currentGameId || !account) {
            return;
        }
        
        // ⛔ Khóa nút ngay từ đầu
        if (actionInProgress) {
            return; // Prevent double-click
        }
        setActionInProgress(true);
        
        // Check game state before hitting
        if (!gameState) {
            await refreshGameState();
        }
        
        const phaseNum = gameState ? (typeof gameState.phase === 'bigint' ? Number(gameState.phase) : gameState.phase) : null;
        
        if (phaseNum !== 0) {
            setActionInProgress(false); // ✅ Mở lại nút nếu validation fail
            return;
        }
        
        if (gameState?.player?.toLowerCase() !== account?.toLowerCase()) {
            setActionInProgress(false); // ✅ Mở lại nút nếu validation fail
            return;
        }
        
        try {
            const tx = await hit(currentGameId);
            await tx.wait();
            
            // Retry logic: Wait for Gateway to be ready with exponential backoff
            const waitForGateway = async (maxRetries = 5, initialDelay = 2000) => {
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        await refreshGameState();
                        const testHandle = await getBustFlag(currentGameId);
                        if (testHandle) {
                            return true;
                        }
                    } catch (error) {
                        if (i < maxRetries - 1) {
                            const delay = initialDelay * Math.pow(2, i);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } else {
                            console.error('Gateway not ready after max retries');
                            throw error;
                        }
                    }
                }
                return false;
            };
            
            const gatewayReady = await waitForGateway();
            if (!gatewayReady) {
                throw new Error('Gateway timeout: Could not verify Gateway is ready');
            }
            
            // Refresh game state to get latest handles
            await refreshGameState();
            
            // Get fresh game state after hit to ensure we have latest handles
            const freshState = await getGameState(currentGameId);
            
            // 1. Decrypt new card and playerSum together with a SINGLE signature (reencryptMultiple)
            let newCard: number | null = null;
            let currentSum: number | null = null;
            
            if (freshState?.deckIndex !== undefined && freshState?.playerSumHandle) {
                try {
                    const deckIndexNum = typeof freshState.deckIndex === 'bigint' 
                        ? Number(freshState.deckIndex) 
                        : freshState.deckIndex;
                    const newCardIndex = deckIndexNum - 1; // Card just drawn (deckIndex was incremented in hit())
                    
                    if (newCardIndex >= 0 && newCardIndex < 52) {
                        const newCardHandle = await getDeckCard(currentGameId, newCardIndex);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Use reencryptMultiple to decrypt both new card and sum with a single signature
                        const signer = getAppWalletSigner();
                        const [newCardValue, sumValue] = await reencryptMultiple(
                            [newCardHandle, freshState.playerSumHandle],
                            CONTRACT_ADDRESS,
                            account!,
                            signer || undefined
                        );
                        
                        newCard = Number(newCardValue);
                        currentSum = Number(sumValue);
                        
                        if (newCard >= 1 && newCard <= 13) {
                            setPlayerCards(prev => [...prev, newCard!]);
                            setPlayerCardDeckIndices(prev => [...prev, newCardIndex]);
                        }
                        setPlayerSum(currentSum);
                        await refreshGameState();
                    }
                } catch (error: any) {
                    console.error('❌ Error decrypting new card and sum:', error);
                    console.error('Error details:', error?.message, error?.stack);
                    // Fallback: try decrypting sum separately if batch fails
                    try {
                        if (freshState?.playerSumHandle) {
                            const signer = getAppWalletSigner();
                            const sum = await reencrypt(freshState.playerSumHandle, CONTRACT_ADDRESS, account!, signer || undefined);
                            currentSum = Number(sum);
                            setPlayerSum(currentSum);
                        }
                    } catch (fallbackError) {
                        console.error('Fallback sum decrypt also failed:', fallbackError);
                        throw error; // Throw original error
                    }
                }
            } else {
                // Fallback: decrypt sum only if we don't have new card handle
                try {
                    if (freshState?.playerSumHandle) {
                        const signer = getAppWalletSigner();
                        const sum = await reencrypt(freshState.playerSumHandle, CONTRACT_ADDRESS, account!, signer || undefined);
                        currentSum = Number(sum);
                        setPlayerSum(currentSum);
                        await refreshGameState();
                    }
                } catch (error: any) {
                    console.error('Error decrypting player sum:', error);
                    throw error;
                }
            }
            
            // 3. Decrypt bustFlag (publicDecrypt - no signature needed)
            try {
                await refreshGameState();
                const bustFlagHandle = await getBustFlag(currentGameId);
                const bustFlagValue = await publicDecrypt(bustFlagHandle);
                const bustFlag = Number(bustFlagValue);
                
                if (bustFlag === 1) {
                    await setBustPhase(currentGameId);
                    await refreshGameState();
                    await endGame(currentGameId);
                    await handleEndGameLogic();
                } else {
                    await refreshGameState();
                }
            } catch (error) {
                console.error('Error decrypting bust flag:', error);
                if (currentSum !== null && currentSum > 21) {
                    await setBustPhase(currentGameId);
                    await refreshGameState();
                    await endGame(currentGameId);
                    await handleEndGameLogic();
                } else {
                    await refreshGameState();
                }
            }
        } catch (error: any) {
            console.error('Hit error details:', error);
            console.error('Error data:', error.data);
            console.error('Error code:', error.code);
            
            // ✅ Mở lại nút nếu có lỗi
            setActionInProgress(false);
        } finally {
            // ✅ Đảm bảo mở lại nút sau khi hoàn thành toàn bộ flow (bao gồm decrypt)
            setActionInProgress(false);
        }
    };

    // Handle stand - Flow 4
    const handleStand = async () => {
        if (!currentGameId || !account) {
            return;
        }
        
        // ⛔ Khóa nút ngay từ đầu
        if (actionInProgress) {
            return; // Prevent double-click
        }
        setActionInProgress(true);
        
        try {
            await stand(currentGameId);
            await refreshGameState();
            await handleDealerTurn(); // Đã chứa toàn bộ logic decrypt dealer cards
        } catch (error: any) {
            console.error('Stand error:', error);
        } finally {
            // ✅ Đảm bảo mở lại nút sau khi hoàn thành toàn bộ flow (bao gồm decrypt)
            setActionInProgress(false);
        }
    };

    // Common function to handle end game logic (decrypt hole card, winFlag, payout)
    const handleEndGameLogic = async () => {
        if (!currentGameId) return;
        
        const waitForGateway = async (maxRetries = 5, initialDelay = 2000) => {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    await refreshGameState();
                    const testHandle = await getWinFlag(currentGameId);
                    if (testHandle) {
                        return true;
                    }
                } catch (error) {
                    if (i < maxRetries - 1) {
                        const delay = initialDelay * Math.pow(2, i);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error('Gateway not ready after max retries');
                        throw error;
                    }
                }
            }
            return false;
        };
        
        try {
            await waitForGateway();
            await refreshGameState();
            
            // Get fresh state once at the beginning
            const endGameState = await getGameState(currentGameId);
            
            try {
                // Prepare all handles for batch decrypt
                const cards = await getDealerCards(currentGameId);
                const winFlagHandle = await getWinFlag(currentGameId);
                
                const endGameHandlesToDecrypt: bigint[] = [];
                
                // Add holeCardHandle
                if (cards?.holeCardHandle) {
                    endGameHandlesToDecrypt.push(cards.holeCardHandle);
                }
                
                // Add dealerSumHandle
                if (endGameState?.dealerSumHandle) {
                    endGameHandlesToDecrypt.push(endGameState.dealerSumHandle);
                }
                
                // Add winFlagHandle
                if (winFlagHandle) {
                    endGameHandlesToDecrypt.push(winFlagHandle);
                }
                
                // Batch decrypt all handles at once
                let holeCard: number | null = null;
                let dealerSumValue: number | null = null;
                let winFlag: number | null = null;
                
                if (endGameHandlesToDecrypt.length > 0) {
                    try {
                        const decryptedValues = await publicDecryptMultiple(endGameHandlesToDecrypt);
                        let valueIndex = 0;
                        
                        // Extract values in order: holeCard, dealerSum, winFlag
                        if (cards?.holeCardHandle) {
                            holeCard = Number(decryptedValues[valueIndex++]);
                            setDealerHoleCard(holeCard);
                        }
                        
                        if (endGameState?.dealerSumHandle) {
                            dealerSumValue = Number(decryptedValues[valueIndex++]);
                            setDealerSum(dealerSumValue);
                        }
                        
                        if (winFlagHandle) {
                            winFlag = Number(decryptedValues[valueIndex++]);
                            setWinFlag(winFlag);
                        }
                    } catch (batchError) {
                        console.error('Error in batch decrypt endGame, trying individual decrypts:', batchError);
                        // Fallback: Try individual decrypts
                        if (cards?.holeCardHandle) {
                            try {
                                const holeCardValue = await publicDecrypt(cards.holeCardHandle);
                                holeCard = Number(holeCardValue);
                                setDealerHoleCard(holeCard);
                            } catch (error) {
                                console.warn('Could not decrypt holeCard:', error);
                            }
                        }
                        
                        if (endGameState?.dealerSumHandle) {
                            try {
                                const sum = await publicDecrypt(endGameState.dealerSumHandle);
                                dealerSumValue = Number(sum);
                                setDealerSum(dealerSumValue);
                            } catch (error) {
                                console.warn('Could not decrypt dealerSum after endGame:', error);
                            }
                        }
                        
                        if (winFlagHandle) {
                            try {
                                const winFlagValue = await publicDecrypt(winFlagHandle);
                                winFlag = Number(winFlagValue);
                                setWinFlag(winFlag);
                            } catch (error) {
                                console.warn('Could not decrypt winFlag:', error);
                            }
                        }
                    }
                }
                
                // Note: dealerCards state should only contain cards from dealerHit (not cardUp or holeCard)
                // getDealerHand() will combine cardUp, holeCard, and dealerCards for display
                // So we don't need to modify dealerCards here
                
                if (playerCards.length === 0 && playerCard1 !== null && playerCard2 !== null) {
                    setPlayerCards([playerCard1, playerCard2]);
                }
                
                const playerWon = winFlag === 1;
                
                // Get bet amount for toast display - use betAmount from state
                let betAmountForToast = '0';
                if (betAmount) {
                    betAmountForToast = formatChipBalance(BigInt(parseInt(betAmount) || 0));
                }
                
                if (playerWon) {
                    try {
                        await payoutWinner(currentGameId, true);
                        await refreshChipBalance();
                        // Show win toast with chips (bet amount won is 2x for blackjack, but showing bet amount here)
                        showToast.youWin(betAmountForToast);
                    } catch (error: any) {
                        console.error('Error claiming payout:', error);
                    }
                } else {
                    // Show lose toast with chips
                    showToast.youLose(betAmountForToast);
                }
            } catch (error) {
                console.error('Error decrypting end game results:', error);
            }
        } catch (error: any) {
            console.error('Error in end game logic:', error);
        }
    };

    // Handle dealer turn (automated) - Flow 4
    const handleDealerTurn = async () => {
        if (!currentGameId) return;
        
        const waitForGateway = async (maxRetries = 5, initialDelay = 2000) => {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    await refreshGameState();
                    const testHandle = await getContinueFlag(currentGameId);
                    if (testHandle) {
                        return true;
                    }
                } catch (error) {
                    if (i < maxRetries - 1) {
                        const delay = initialDelay * Math.pow(2, i);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error('Gateway not ready after max retries');
                        throw error;
                    }
                }
            }
            return false;
        };
        
        // Wait for Gateway after stand()
        const gatewayReady = await waitForGateway();
        if (!gatewayReady) {
            throw new Error('Gateway timeout: Could not verify Gateway is ready');
        }
        
        // Dealer hits until continueFlag == 0 (dealerSum >= 17)
        let maxIterations = 10; // Safety limit
        let iteration = 0;
        
        while (maxIterations-- > 0) {
            iteration++;
            try {
                // CRITICAL: Get fresh state after refreshGameState()
                await refreshGameState();
                const freshState = await getGameState(currentGameId);
                
                // Check current phase before proceeding
                const phaseNum = freshState ? (typeof freshState.phase === 'bigint' ? Number(freshState.phase) : freshState.phase) : null;
                
                if (phaseNum !== 1) {
                    break;
                }
                
                // First, check continueFlag and dealerSum BEFORE hitting (to see if we need to hit)
                // Use freshState from above - no need to refresh again
                let shouldContinue = true;
                try {
                    // Batch decrypt dealerSum and continueFlag together for better performance
                    const continueFlagHandle = await getContinueFlag(currentGameId);
                    const handlesToDecrypt: bigint[] = [];
                    
                    if (freshState?.dealerSumHandle) {
                        handlesToDecrypt.push(freshState.dealerSumHandle);
                    }
                    if (continueFlagHandle) {
                        handlesToDecrypt.push(continueFlagHandle);
                    }
                    
                    if (handlesToDecrypt.length > 0) {
                        try {
                            // Batch decrypt all handles at once
                            const decryptedValues = await publicDecryptMultiple(handlesToDecrypt);
                            let dealerSumValue: number | null = null;
                            let continueFlag: number | null = null;
                            
                            // Extract values based on order
                            let valueIndex = 0;
                            if (freshState?.dealerSumHandle) {
                                dealerSumValue = Number(decryptedValues[valueIndex++]);
                                
                                if (dealerSumValue > 21) {
                                    // Dealer bust - stop immediately
                                    shouldContinue = false;
                                    break;
                                }
                            }
                            if (continueFlagHandle) {
                                continueFlag = Number(decryptedValues[valueIndex++]);
                            }
                    
                            if (continueFlag !== null && continueFlag === 0) {
                                shouldContinue = false;
                                break;
                            }
                        } catch (batchError) {
                            console.error(`[Dealer Turn Iteration ${iteration}] Error in batch decrypt, trying individual decrypts:`, batchError);
                            // Fallback: Try individual decrypts
                            if (freshState?.dealerSumHandle) {
                                try {
                                    const sum = await publicDecrypt(freshState.dealerSumHandle);
                                    const dealerSumValue = Number(sum);
                                    if (dealerSumValue > 21) {
                                        shouldContinue = false;
                                        break;
                                    }
                                } catch (fallbackError) {
                                    console.warn(`[Dealer Turn Iteration ${iteration}] Could not decrypt dealerSum, continuing to check continueFlag`);
                                }
                            }
                            try {
                                const continueFlagValue = await publicDecrypt(continueFlagHandle);
                                const continueFlag = Number(continueFlagValue);
                                if (continueFlag === 0) {
                                    shouldContinue = false;
                                    break;
                                }
                            } catch (fallbackError) {
                                console.warn(`[Dealer Turn Iteration ${iteration}] Could not decrypt continueFlag`);
                            }
                        }
                    } else {
                        // No handles to decrypt - skip
                        console.warn(`[Dealer Turn Iteration ${iteration}] No handles available to decrypt`);
                    }
                } catch (error) {
                    console.error(`[Dealer Turn Iteration ${iteration}] Error checking continueFlag, trying fallback:`, error);
                    // Fallback: Check dealerSum directly using freshState from above
                    if (freshState?.dealerSumHandle) {
                        try {
                            const sum = await publicDecrypt(freshState.dealerSumHandle);
                            const dealerSumValue = Number(sum);
                            if (dealerSumValue > 21 || dealerSumValue >= 17) {
                                shouldContinue = false;
                                break;
                            }
                        } catch (fallbackError) {
                            console.warn(`[Dealer Turn Iteration ${iteration}] Fallback decrypt also failed, continuing anyway`);
                            // Continue anyway
                        }
                    }
                }
                
                if (!shouldContinue) {
                    break;
                }
                
                await dealerHit(currentGameId);
                await waitForGateway();
                
                // CRITICAL: Get fresh state after dealerHit() to get updated handles
                await refreshGameState();
                const postHitState = await getGameState(currentGameId);
                
                try {
                    // Prepare handles for batch decrypt after hit
                    const continueFlagHandle = await getContinueFlag(currentGameId);
                    const postHitHandlesToDecrypt: bigint[] = [];
                    let newCardHandle: bigint | null = null;
                    
                    // Get newCardHandle first if deckIndex is available
                    if (postHitState?.deckIndex !== undefined) {
                        try {
                            const deckIndexNum = typeof postHitState.deckIndex === 'bigint' 
                                ? Number(postHitState.deckIndex) 
                                : postHitState.deckIndex;
                            const newCardIndex = deckIndexNum - 1;
                            
                            if (newCardIndex >= 0 && newCardIndex < 52) {
                                newCardHandle = await getDeckCard(currentGameId, newCardIndex);
                                postHitHandlesToDecrypt.push(newCardHandle);
                            }
                        } catch (error) {
                            console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error getting newCardHandle:`, error);
                        }
                    }
                    
                    // Add continueFlagHandle and dealerSumHandle to batch
                    if (continueFlagHandle) {
                        postHitHandlesToDecrypt.push(continueFlagHandle);
                    }
                    if (postHitState?.dealerSumHandle) {
                        postHitHandlesToDecrypt.push(postHitState.dealerSumHandle);
                    }
                    
                    // Batch decrypt all handles at once
                    if (postHitHandlesToDecrypt.length > 0) {
                        try {
                            const decryptedValues = await publicDecryptMultiple(postHitHandlesToDecrypt);
                            let valueIndex = 0;
                            let newCard: number | null = null;
                            let continueFlag: number | null = null;
                            let dealerSumValue: number | null = null;
                            
                            // Extract values in order: newCard, continueFlag, dealerSum
                            if (newCardHandle) {
                                newCard = Number(decryptedValues[valueIndex++]);
                                
                                if (newCard >= 1 && newCard <= 13) {
                                    setDealerCards(prev => [...prev, newCard!]);
                                }
                            }
                            
                            if (continueFlagHandle) {
                                continueFlag = Number(decryptedValues[valueIndex++]);
                            }
                            
                            if (postHitState?.dealerSumHandle) {
                                dealerSumValue = Number(decryptedValues[valueIndex++]);
                                setDealerSum(dealerSumValue);
                                
                                // Check if dealer bust (> 21) - stop immediately
                                if (dealerSumValue > 21) {
                                    break;
                                }
                            }
                            
                            if (continueFlag !== null && continueFlag === 0) {
                                break;
                            }
                        } catch (batchError) {
                            console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error in batch decrypt after hit, trying individual decrypts:`, batchError);
                            // Fallback: Try individual decrypts
                            if (continueFlagHandle) {
                                try {
                                    const continueFlagValue = await publicDecrypt(continueFlagHandle);
                                    const continueFlag = Number(continueFlagValue);
                                    if (continueFlag === 0) {
                                        break;
                                    }
                                } catch (error) {
                                    console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error decrypting continueFlag:`, error);
                                }
                            }
                            
                            if (newCardHandle) {
                                try {
                                    const newCardValue = await publicDecrypt(newCardHandle);
                                    const newCard = Number(newCardValue);
                                    if (newCard >= 1 && newCard <= 13) {
                                        setDealerCards(prev => [...prev, newCard]);
                                    }
                                } catch (error) {
                                    console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error decrypting newCard:`, error);
                                }
                            }
                            
                            if (postHitState?.dealerSumHandle) {
                                try {
                                    const sum = await publicDecrypt(postHitState.dealerSumHandle);
                                    const dealerSumValue = Number(sum);
                                    setDealerSum(dealerSumValue);
                                    if (dealerSumValue > 21) {
                                        break;
                                    }
                                } catch (error) {
                                    console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error decrypting dealerSum:`, error);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error after dealerHit:`, error);
                    // Fallback: Check dealerSum directly using postHitState from above
                    if (postHitState?.dealerSumHandle) {
                        try {
                            const sum = await publicDecrypt(postHitState.dealerSumHandle);
                            const dealerSumValue = Number(sum);
                            if (dealerSumValue > 21 || dealerSumValue >= 17) {
                                break;
                            }
                        } catch (fallbackError) {
                            console.warn(`[Dealer Turn Iteration ${iteration}] Fallback decrypt also failed, continuing anyway`);
                            // Continue anyway
                        }
                    }
                }
            } catch (error: any) {
                console.error(`[Dealer Turn Iteration ${iteration}] ❌ Error in dealer turn iteration:`, error);
            }
        }
        
        try {
            await endGame(currentGameId);
            await handleEndGameLogic();
        } catch (error: any) {
            console.error('Error ending game:', error);
        }
    };
    
    // Decrypt dealer hole card (only after stand)
    const decryptDealerHoleCard = async () => {
        if (!currentGameId || !account) return;
        try {
            const cards = await getDealerCards(currentGameId);
            const signer = getAppWalletSigner();
            const holeCardValue = await reencrypt(cards.holeCardHandle, CONTRACT_ADDRESS, account, signer || undefined);
            setDealerHoleCard(Number(holeCardValue));
        } catch (error) {
            console.error('Error decrypting dealer hole card:', error);
        }
    };


    const getStatusColor = (result: number | null, playerSum: number | null, dealerSum: number | null, isDecrypting: boolean) => {
        // If still decrypting, show neutral color
        if (isDecrypting) {
            return 'text-slate-400';
        }
        
        // Priority 1: Check playerSum for bust (before winFlag)
        if (playerSum !== null && playerSum > 21) return 'text-rose-400'; // Player bust = lose
        
        // Priority 2: Check dealerSum for bust
        if (dealerSum !== null && dealerSum > 21) return 'text-emerald-400'; // Dealer bust = win
        
        // Priority 3: Use winFlag if available
        if (result === 1) return 'text-emerald-400';
        if (result === 0) return 'text-rose-400';
        
        // Priority 4: Check tie
        if (playerSum !== null && dealerSum !== null && playerSum === dealerSum) return 'text-amber-400';
        
        return 'text-amber-400';
    };

    const getResultText = (winFlag: number | null, playerSum: number | null, dealerSum: number | null, isDecrypting: boolean) => {
        // If still decrypting, show loading state
        if (isDecrypting) {
            return 'Processing...';
        }
        
        // Priority 1: Check playerSum for bust (before winFlag)
        if (playerSum !== null && playerSum > 21) return 'You Lose'; // Player bust
        
        // Priority 2: Check dealerSum for bust (before winFlag)
        if (dealerSum !== null && dealerSum > 21) return 'You Win'; // Dealer bust
        
        // Priority 3: Use winFlag if available
        if (winFlag === 1) return 'You Win';
        if (winFlag === 0) return 'You Lose';
        
        // Priority 4: Use playerSum and dealerSum to determine result
        if (playerSum !== null && dealerSum !== null) {
            if (playerSum > dealerSum) return 'You Win';
            if (playerSum < dealerSum) return 'You Lose';
            if (playerSum === dealerSum) return 'Push';
        }
        
        // If we have at least one sum but not winFlag yet, wait a bit
        if (playerSum !== null || dealerSum !== null) {
            return 'Processing...';
        }
        
        // Fallback: Only show "Game Over" if we truly don't have any info
        return 'Game Over';
    };

    // Get player hand for display with deck indices
    const getPlayerHand = (): Array<{ value: number; deckIndex: number } | number> => {
        if (playerCards.length > 0 && playerCardDeckIndices.length === playerCards.length) {
            return playerCards.map((value, idx) => ({
                value,
                deckIndex: playerCardDeckIndices[idx]
            }));
        }
        // Fallback to initial cards
        if (playerCard1 !== null && playerCard2 !== null) {
            return [
                { value: playerCard1, deckIndex: 0 },
                { value: playerCard2, deckIndex: 1 }
            ];
        }
        return [];
    };

    // Get dealer hand for display
    const getDealerHand = (): (number | null)[] => {
        // Build dealer hand: [cardUp, holeCard, ...hitCards]
        const hand: (number | null)[] = [];
        
        // Always show cardUp (first card)
        if (dealerCardUp !== null) {
            hand.push(dealerCardUp);
        } else {
            // If cardUp not yet decrypted, add placeholder
            hand.push(null);
        }
        
        // Always show holeCard (second card) - will be hidden if not decrypted or not completed
        // This ensures we always show 2 cards from the start
        if (dealerHoleCard !== null) {
            hand.push(dealerHoleCard);
        } else {
            // If holeCard not yet decrypted, add placeholder (will be shown as hidden)
            hand.push(null);
        }
        
        // Add all dealer hit cards (these are added during dealer turn)
        if (dealerCards.length > 0) {
            hand.push(...dealerCards);
        }
        
        return hand;
    };

    const phaseNum = gameState ? (typeof gameState.phase === 'bigint' ? Number(gameState.phase) : gameState.phase) : null;
    const isPlayerTurn = phaseNum === 0;
    const isDealerTurn = phaseNum === 1;
    const isGameEnding = phaseNum === 2;
    const isCompleted = phaseNum === 3;
    const isEndGame = isGameEnding || isCompleted; // Show hole card when endgame or completed

    // Show wallet setup/unlock modals
    if (showWalletSetup) {
        return <WalletSetupModal onComplete={() => setShowWalletSetup(false)} />;
    }
    
    if (showWalletUnlock) {
        return <WalletUnlockModal onUnlock={() => setShowWalletUnlock(false)} />;
    }

    if (!account) {
        // Wallet modals are handled above, so if we reach here, just show loading
        return null;
    }

    return (
        <>
            <ExportPrivateKeyModal 
                isOpen={showExportPrivateKey} 
                onClose={() => setShowExportPrivateKey(false)} 
            />
            
            <div className="min-h-screen bg-slate-900 flex flex-col text-white font-sans">
            <ChipsModal 
                isOpen={isCashierOpen} 
                onClose={() => setIsCashierOpen(false)}
                onBuy={async (ethAmount) => {
                    try {
                        // Check if app wallet has enough ETH
                        if (ethBalance < ethAmount) {
                            return;
                        }
                        await buyChips(ethAmount);
                        await refreshChipBalance();
                    } catch (error: any) {
                        console.error('Buy chips error:', error);
                    }
                }}
                onSell={async (chipAmount) => {
                    await sellChips(chipAmount);
                    await refreshChipBalance();
                }}
                onWithdraw={async (ethAmount, toAddress) => {
                    await withdrawEth(ethAmount, toAddress);
                    await refreshEthBalance();
                    await refreshChipBalance();
                }}
                balance={chipBalance}
                ethBalance={ethBalance}
                loading={loading}
            />

            {/* Navbar */}
            <nav className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
                <div className="w-full max-w-[80%] mx-auto h-full flex items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-2">
                        <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
                        <span className="font-bold text-xl hidden sm:inline">BlindJack</span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                                    <button
                        onClick={() => setIsCashierOpen(true)}
                        className="h-10 px-3 flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                        title="Cashier"
                                    >
                        <img src="/chip.svg" alt="Chip" className="w-5 h-5" />
                        <span className="text-sm font-medium text-white">Cashier</span>
                                    </button>
                    
                    <div className="h-8 w-[1px] bg-slate-800 hidden sm:block"></div>
                    
                    {/* Wallet Dropdown */}
                    <div className="relative" data-wallet-dropdown>
                                    <button
                            data-wallet-button
                            onClick={() => setIsWalletDropdownOpen(!isWalletDropdownOpen)}
                            className="h-10 flex items-center gap-2 bg-slate-800 px-3 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                                    >
                            <span className="text-base font-mono text-white">{formatAddress(account)}</span>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isWalletDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                        {/* Dropdown Menu */}
                        {isWalletDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                                    {/* Dòng 1: Address + Copy */}
                                    <div className="h-10 px-4 border-b border-slate-700 flex items-center justify-between">
                                        <span className="text-base font-mono text-white">{formatAddress(account)}</span>
                                    <button
                                            onClick={copyAddress}
                                            className="p-1.5 hover:bg-slate-700 rounded transition-colors group"
                                            title="Copy address"
                                    >
                                            <Copy className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                                    </button>
                                </div>

                                    {/* Dòng 2: Export Private Key */}
                            <button
                                        onClick={() => {
                                            setShowExportPrivateKey(true);
                                            setIsWalletDropdownOpen(false);
                                        }}
                                        className="h-10 w-full px-4 text-left hover:bg-slate-700 transition-colors text-base text-amber-400"
                                    >
                                        Export Private Key
                            </button>

                                    {/* Dòng 3: Disconnect */}
                            <button
                                        onClick={handleDisconnect}
                                        className="h-10 w-full px-4 text-left hover:bg-slate-700 transition-colors flex items-center gap-2 text-base text-rose-400 border-t border-slate-700"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Disconnect
                            </button>
                        </div>
                        )}
                            </div>
                    </div>
            </div>
            </nav>

            {/* Game Area */}
            <main className="flex-1 relative felt-bg flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
                
                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
                        <div className="mb-4 relative">
                            <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Lock className="w-6 h-6 text-emerald-400" />
                                            </div>
                                            </div>
                        <p className="text-sm font-medium animate-pulse">Processing transaction...</p>
                        <p className="text-xs text-slate-400 mt-2">Homomorphic Operation in progress...</p>
                                            </div>
            )}

                {/* Lobby State */}
                {!currentGameId && (
                    <div className="w-full max-w-md bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-5 transform transition-all animate-in zoom-in-95">
                        <div className="text-center mb-5">
                            <h2 className="text-xl font-bold mb-1">Place Your Bet</h2>
                            <p className="text-sm text-slate-400">Balance: {formatChipBalance(chipBalance)} CHIP</p>
                                </div>

                        <div className="mb-5">
                            <div className="relative">
                                    <input
                                        type="number"
                                        value={betAmount || ''}
                                        onChange={(e) => setBetAmount(e.target.value)}
                                        placeholder="0"
                                    className="w-full bg-slate-900 border-2 border-slate-700 rounded-lg py-2 px-3 text-center text-xl font-bold text-white placeholder:text-slate-500 focus:border-emerald-500 outline-none transition-colors"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">CHIP</span>
                            </div>
                            
                            <div className="flex gap-2 mt-3 justify-center">
                                {[25, 50, 75, 100].map(percent => {
                                    const amount = chipBalance > BigInt(0) 
                                        ? (chipBalance * BigInt(percent) / BigInt(100)).toString()
                                        : '0';
                                    return (
                                        <button
                                            key={percent}
                                            onClick={() => setBetAmount(amount)}
                                            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-medium transition-colors border border-slate-600"
                                        >
                                            {percent}%
                                        </button>
                                    );
                                })}
                                    </div>
                                </div>

                            <button
                                onClick={handleStartGame}
                            disabled={loading || isStartingGame || !isWalletReady || !isFhevmReady || BigInt(betAmount || 0) > chipBalance || BigInt(betAmount || 0) <= 0}
                            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-emerald-900/30 transform active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {!isWalletReady || !isFhevmReady ? 'Initializing...' : (loading || isStartingGame) ? 'Processing...' : 'Deal Cards'}
                            </button>
                            </div>
                )}

                {/* Active Game State */}
                {currentGameId && (
                    <div className="w-full max-w-4xl flex flex-col items-center gap-4 sm:gap-6">
                        
                        {/* Dealer Area */}
                        <div className="flex flex-col items-center">
                            <div className="mb-2 flex items-center gap-2">
                                <span className="text-slate-300 font-medium text-sm bg-black/40 px-3 py-1 rounded-full border border-white/10">Dealer</span>
                                {isCompleted && dealerSum !== null && (
                                    <span className="text-emerald-400 font-bold">{dealerSum}</span>
                                )}
                                            </div>
                            {/* Increased negative spacing for larger cards */}
                            <div className="flex -space-x-16 sm:-space-x-20">
                                {getDealerHand().map((card, idx) => {
                                    // Hide second card (holeCard) if not endgame
                                    const isHoleCard = idx === 1;
                                    const shouldHide = !isEndGame && isHoleCard;
                                    return (
                                        <PlayingCard 
                                            key={`dealer-${idx}`} 
                                            card={card} 
                                            index={idx}
                                            isHidden={shouldHide}
                                        />
                                    );
                                })}
                                            </div>
                                            </div>

                        {/* Center Info / Result */}
                        <div className="flex items-center justify-center py-2">
                            {isCompleted ? (
                                <div className="text-center animate-in zoom-in duration-300">
                                    <h2 className={`text-2xl sm:text-3xl font-black mb-2 drop-shadow-lg ${getStatusColor(winFlag, playerSum, dealerSum, isDecryptingResult)} uppercase`}>
                                        {getResultText(winFlag, playerSum, dealerSum, isDecryptingResult)}
                                    </h2>
                                        <button
                                        onClick={() => setCurrentGameId(null)}
                                        className="flex items-center gap-2 px-6 py-2 bg-white text-slate-900 rounded-full font-bold hover:bg-slate-200 transition-colors shadow-lg mx-auto"
                                        >
                                        <RotateCcw className="w-4 h-4" /> Play Again
                                        </button>
                                    </div>
                            ) : (
                                <div className="bg-black/30 backdrop-blur-sm px-6 py-2 rounded-full border border-white/10 flex items-center justify-center gap-2">
                                    <span className="text-emerald-400 font-bold tracking-wider text-xs uppercase">Bet:</span>
                                    <span className="text-white font-mono text-xl">{betAmount}</span>
                                    <img src="/chip.svg" alt="Chip" className="w-5 h-5" />
                                </div>
                                        )}
                                    </div>

                        {/* Player Area */}
                        <div className="flex flex-col items-center">
                            {isCompleted && (
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="text-slate-300 font-medium text-sm bg-black/40 px-3 py-1 rounded-full border border-white/10">Player</span>
                                    {playerSum !== null && (
                                        <span className="text-emerald-400 font-bold">{playerSum}</span>
                                    )}
                                </div>
                            )}
                            {/* Increased negative spacing for larger cards */}
                            <div className="flex -space-x-16 sm:-space-x-20 mb-4">
                                {getPlayerHand().map((cardData, idx) => {
                                    if (typeof cardData === 'number') {
                                        // Fallback for old format - show hidden if not decrypted
                                        return <PlayingCard key={`player-${idx}`} card={playerCardsDecrypted ? cardData : null} index={idx} isHidden={!playerCardsDecrypted} />;
                                    }
                                    // Show hidden if cards not decrypted yet (only for first 2 cards)
                                    const isHidden = !playerCardsDecrypted && idx < 2;
                                    return <PlayingCard key={`player-${idx}`} card={isHidden ? null : cardData.value} index={cardData.deckIndex} isHidden={isHidden} />;
                                })}
                                </div>
                            
                            {!isCompleted && (
                                <div className="flex items-center justify-between gap-4 px-6 py-2 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-2xl shadow-xl max-w-xs mx-auto mt-6">
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-3xl">♠</span>
                                        <span className={`text-xl font-bold ${playerSum !== null && playerSum > 21 ? 'text-rose-500' : 'text-white'}`}>
                                            {playerSum ?? '???'}
                                        </span>
                            </div>

                                    <div className="flex gap-3 flex-shrink-0">
                                        {isPlayerTurn && (
                                            <>
                                    <button
                                        onClick={handleHit}
                                                    disabled={loading || actionInProgress}
                                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 active:translate-y-0.5 transition-all disabled:opacity-50"
                                                >
                                                    Hit
                                    </button>
                                    <button
                                        onClick={handleStand}
                                                    disabled={loading || actionInProgress}
                                                    className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg shadow-lg shadow-amber-900/20 active:translate-y-0.5 transition-all disabled:opacity-50"
                                                >
                                                    Stand
                                    </button>
                                                </>
                                            )}
                                        {!isPlayerTurn && !isCompleted && (
                                            <div className="px-4 py-2 text-slate-400 text-sm font-medium italic">
                                                {isDealerTurn ? "Dealer's Turn..." : "Processing..."}
                                                        </div>
                                                    )}
                                                        </div>
                                        </div>
                                        )}
                                    </div>
                                </div>
                            )}
            </main>
            
            {/* Footer */}
            <footer className="bg-slate-900 border-t border-slate-800 py-4 px-6 text-center text-slate-500 text-sm">
                <p>© 2025 BlindJack. Powered by Fully Homomorphic Encryption (FHE) from Zama.</p>
            </footer>

            </div>
        </>
    );
};


