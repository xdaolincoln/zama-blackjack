// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint8, euint32, euint256, ebool, externalEuint8, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FHEBlackjack is ZamaEthereumConfig {
    enum Phase { PlayerTurn, DealerTurn, GameEnding, Completed }

    struct Game {
        address player;
        euint32 betAmount; // 👈 PRIVATE - encrypted bet amount (for privacy)
        uint256 plainBetAmount; // 👈 PUBLIC - plain bet amount (for payout, không ảnh hưởng privacy vì đã trừ từ balance)
        euint8[52] deck;
        uint8 deckIndex;
        euint8 playerCard1;
        euint8 playerCard2;
        euint8 dealerCardUp;
        euint8 dealerHoleCard;
        euint32 playerSum;
        euint32 dealerSum;
        euint32 playerBaseSum; // Base sum with all Aces = 1 (for correct sum calculation)
        euint32 dealerBaseSum; // Base sum with all Aces = 1 (for correct sum calculation)
        euint32 playerAceCount; // Track number of Aces in player hand (for correct sum calculation)
        euint32 dealerAceCount; // Track number of Aces in dealer hand (for correct sum calculation)
        euint32 bustFlag; // 1 if player bust, 0 otherwise
        euint32 winFlag; // 1 if player wins, 0 otherwise
        euint32 continueFlag; // 1 if dealer should continue (dealerSum < 17), 0 otherwise
        Phase phase;
        bool exists;
    }

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;

    // 👇 CHIP balances (PUBLIC - plain values, không encrypted)
    mapping(address => uint256) public chipBalances;

    // 👇 Tỷ giá: 1 ETH = 10,000 CHIP
    uint256 public constant CHIP_PER_ETH = 10_000;

    constructor() {
        nextGameId = 1;
    }

    /// @notice Convert card value (1-13) to Blackjack base value (before Ace adjustment)
    /// @param card Raw card value: 1=A, 2-10=number, 11=J, 12=Q, 13=K
    /// @return baseValue Base Blackjack value: A=1, 2-10=value, J/Q/K=10
    function getBlackjackBaseValue(euint8 card) internal returns (euint32) {
        // Card values: 1=A, 2-10=number, 11=J, 12=Q, 13=K
        // Blackjack base values: A=1, 2-10=value, J/Q/K=10
        
        // Check if card is J, Q, or K (11, 12, 13)
        ebool isFaceCard = FHE.or(
            FHE.eq(card, FHE.asEuint8(11)), // J
            FHE.or(
                FHE.eq(card, FHE.asEuint8(12)), // Q
                FHE.eq(card, FHE.asEuint8(13))  // K
            )
        );
        
        // If face card (J/Q/K), return 10
        // Otherwise, return card value (A=1, 2-10=value)
        euint32 faceCardValue = FHE.asEuint32(10);
        euint32 cardAs32 = FHE.add(FHE.asEuint32(0), card); // Convert euint8 to euint32
        
        return FHE.select(isFaceCard, faceCardValue, cardAs32);
    }

    /// @notice Calculate correct Blackjack sum with proper Ace handling
    /// @param baseSum Sum with all Aces counted as 1 (base values only)
    /// @param aceCount Number of Aces in the hand
    /// @return finalSum Final sum after applying soft Ace rule (1 Ace = 11 if possible)
    /// @dev Blackjack rule: Calculate sum with all Aces = 1, then if sum + 10 <= 21 and aceCount > 0, add 10
    /// @dev This ensures only 1 Ace can be 11, and it's always the optimal choice
    function calculateBlackjackSum(euint32 baseSum, euint32 aceCount) internal returns (euint32) {
        // Check if we can use 1 Ace as 11 (soft Ace)
        // Condition: aceCount > 0 AND baseSum + 10 <= 21
        ebool hasAce = FHE.gt(aceCount, FHE.asEuint32(0));
        euint32 sumWithSoftAce = FHE.add(baseSum, FHE.asEuint32(10));
        ebool canUseSoftAce = FHE.le(sumWithSoftAce, FHE.asEuint32(21));
        ebool shouldAddTen = FHE.and(hasAce, canUseSoftAce);
        
        // If conditions met, add 10 (use 1 Ace as 11)
        // Otherwise, use baseSum (all Aces = 1)
        return FHE.select(
            shouldAddTen,
            sumWithSoftAce,
            baseSum
        );
    }

    /// @notice Add card value to sum with proper Ace handling (1 or 11)
    /// @param currentBaseSum Current base sum (all Aces = 1) before adding the card
    /// @param currentAceCount Current number of Aces in hand
    /// @param card Raw card value (1-13)
    /// @return newBaseSum New base sum after adding the card (all Aces = 1)
    /// @return newAceCount New Ace count after adding the card
    /// @return finalSum Final sum with proper Ace handling (1 Ace = 11 if possible)
    function addCardToSum(euint32 currentBaseSum, euint32 currentAceCount, euint8 card) internal returns (euint32 newBaseSum, euint32 newAceCount, euint32 finalSum) {
        // Get base value (A=1, 2-10=value, J/Q/K=10)
        euint32 baseValue = getBlackjackBaseValue(card);
        
        // Add base value to sum (Ace = 1, others = their value)
        newBaseSum = FHE.add(currentBaseSum, baseValue);
        
        // Update Ace count if card is Ace
        ebool isAce = FHE.eq(card, FHE.asEuint8(1));
        euint32 aceIncrement = FHE.select(isAce, FHE.asEuint32(1), FHE.asEuint32(0));
        newAceCount = FHE.add(currentAceCount, aceIncrement);
        
        // Calculate final sum with proper Ace handling
        finalSum = calculateBlackjackSum(newBaseSum, newAceCount);
    }

    // =========================
    // BUY / SELL CHIP (PUBLIC - plain values)
    // =========================

    /// @notice User gửi ETH mua CHIP. 1 ETH = 10,000 CHIP
    function buyChips() external payable {
        require(msg.value > 0, "Send ETH to buy CHIP");

        // Tính số CHIP: msg.value (wei) * 10,000 / 1 ether
        uint256 amount = (msg.value * CHIP_PER_ETH) / 1 ether;
        require(amount > 0, "Amount too small");

        // Cộng vào public balance (plain value)
        chipBalances[msg.sender] += amount;
    }

    /// @notice User bán CHIP nhận lại ETH với tỷ giá 1 ETH = 10,000 CHIP
    /// @param chipAmount Số CHIP muốn bán (plain value)
    function sellChips(uint256 chipAmount) external {
        require(chipAmount > 0, "Zero amount");
        require(chipBalances[msg.sender] >= chipAmount, "Insufficient CHIP balance");

        // Tính ETH: chipAmount * 1 ether / 10,000
        uint256 ethAmount = (chipAmount * 1 ether) / CHIP_PER_ETH;
        require(ethAmount > 0, "Amount too small");
        require(address(this).balance >= ethAmount, "Casino lacks ETH");

        // Trừ CHIP từ balance
        chipBalances[msg.sender] -= chipAmount;

        // Trả ETH
        (bool ok, ) = msg.sender.call{value: ethAmount}("");
        require(ok, "ETH transfer failed");
    }

    // =========================
    // GAME LOGIC (FHE) + BETTING
    // =========================

    /// @notice Bắt đầu game, user phải đặt cược bằng CHIP trước
    /// @param encDeck encrypted deck như cũ
    /// @param attestation attestation như cũ
    /// @param encryptedBet encrypted bet amount (PRIVATE - euint32)
    /// @param betProof attestation proof cho encrypted bet
    /// @param plainBet plain bet amount để trừ từ public balance (frontend decrypt off-chain)
    /// @dev Frontend cần: 1) Encrypt bet, 2) Decrypt để lấy plainBet, 3) Gửi cả 2
    function startGame(
        externalEuint8[52] calldata encDeck,
        bytes calldata attestation,
        externalEuint32 encryptedBet,
        bytes calldata betProof,
        uint256 plainBet
    ) external returns (uint256 gameId) {
        require(plainBet > 0, "Bet required");
        require(chipBalances[msg.sender] >= plainBet, "Insufficient CHIP balance");

        // Trừ bet từ public balance (dùng plain value)
        chipBalances[msg.sender] -= plainBet;

        // Lưu encrypted bet (PRIVATE)
        euint32 betAmount = FHE.fromExternal(encryptedBet, betProof);
        FHE.allowThis(betAmount);

        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.player = msg.sender;
        g.betAmount = betAmount; // 👈 Lưu encrypted bet (PRIVATE)
        g.plainBetAmount = plainBet; // 👈 Lưu plain bet (để dùng cho payout, không ảnh hưởng privacy vì đã trừ từ balance)
        g.deckIndex = 4;
        g.phase = Phase.PlayerTurn;
        g.exists = true;

        for (uint8 i = 0; i < 52; i++) {
            g.deck[i] = FHE.fromExternal(encDeck[i], attestation);
            // Grant contract permission to use this card in future transactions (hit, dealerHit, etc.)
            FHE.allowThis(g.deck[i]);
        }

        g.playerCard1 = g.deck[0];
        g.playerCard2 = g.deck[1];
        g.dealerCardUp = g.deck[2];
        g.dealerHoleCard = g.deck[3];

        // Initialize base sums and Ace counts
        g.playerBaseSum = FHE.asEuint32(0);
        g.dealerBaseSum = FHE.asEuint32(0);
        g.playerAceCount = FHE.asEuint32(0);
        g.dealerAceCount = FHE.asEuint32(0);
        
        // Add player cards to sum with proper Ace handling (1 or 11)
        (g.playerBaseSum, g.playerAceCount, g.playerSum) = addCardToSum(g.playerBaseSum, g.playerAceCount, g.playerCard1);
        (g.playerBaseSum, g.playerAceCount, g.playerSum) = addCardToSum(g.playerBaseSum, g.playerAceCount, g.playerCard2);
        
        // Dealer sum starts with card up
        (g.dealerBaseSum, g.dealerAceCount, g.dealerSum) = addCardToSum(g.dealerBaseSum, g.dealerAceCount, g.dealerCardUp);

        // Allow contract to use baseSum and aceCount for future operations
        FHE.allowThis(g.playerBaseSum);
        FHE.allowThis(g.playerAceCount);
        FHE.allowThis(g.dealerBaseSum);
        FHE.allowThis(g.dealerAceCount);

        FHE.allow(g.playerCard1, msg.sender); // Allow player to decrypt card1
        FHE.allowThis(g.playerCard1); // Allow contract to use card1
        FHE.allow(g.playerCard2, msg.sender); // Allow player to decrypt card2
        FHE.allowThis(g.playerCard2); // Allow contract to use card2
        FHE.allow(g.playerSum, msg.sender); // Allow player to decrypt playerSum
        FHE.allowThis(g.playerSum); // Allow contract to use playerSum
        FHE.allow(g.dealerSum, msg.sender); // Allow player to decrypt dealerSum
        FHE.allowThis(g.dealerSum); // Allow contract to use dealerSum
        FHE.makePubliclyDecryptable(g.dealerCardUp);
        
        // Initialize flags
        g.bustFlag = FHE.asEuint32(0);
        g.winFlag = FHE.asEuint32(0);
        g.continueFlag = FHE.asEuint32(0);
    }

    function hit(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.exists && g.player == msg.sender, "invalid player");
        require(g.phase == Phase.PlayerTurn, "wrong phase");
        require(g.deckIndex < 52, "deck empty");

        euint8 newCard = g.deck[g.deckIndex++];
        // Add card to sum with proper Ace handling (1 or 11)
        // Use tracked baseSum and aceCount for accurate calculation
        (g.playerBaseSum, g.playerAceCount, g.playerSum) = addCardToSum(g.playerBaseSum, g.playerAceCount, newCard);

        // Allow contract to use updated baseSum and aceCount for future operations
        FHE.allowThis(g.playerBaseSum);
        FHE.allowThis(g.playerAceCount);

        FHE.allow(newCard, g.player);
        FHE.allow(g.playerSum, g.player); // Allow player to decrypt playerSum
        FHE.allowThis(g.playerSum); // Allow contract to use playerSum

        // Check if bust
        g.bustFlag = FHE.select(
            FHE.gt(g.playerSum, FHE.asEuint32(21)),
            FHE.asEuint32(1),
            FHE.asEuint32(0)
        );
        FHE.makePubliclyDecryptable(g.bustFlag);
        
        // If bust, change phase to GameEnding so endGame() can be called
        // Off-chain will decrypt bustFlag and call endGame if bustFlag == 1
        // Note: We can't use bustFlag directly in if statement, so off-chain handles it
    }

    function stand(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.exists && g.player == msg.sender, "invalid player");
        require(g.phase == Phase.PlayerTurn, "wrong phase");

        // Add hole card to dealer sum with proper Ace handling (1 or 11)
        // Use tracked baseSum and aceCount for accurate calculation
        (g.dealerBaseSum, g.dealerAceCount, g.dealerSum) = addCardToSum(g.dealerBaseSum, g.dealerAceCount, g.dealerHoleCard);

        // Allow contract to use updated baseSum and aceCount for future operations
        FHE.allowThis(g.dealerBaseSum);
        FHE.allowThis(g.dealerAceCount);

        // Allow player to decrypt dealerSum (for endGame comparison)
        FHE.allow(g.dealerSum, g.player);
        FHE.allowThis(g.dealerSum);
        
        // Make dealerSum publicly decryptable so frontend can check if dealer needs to hit
        FHE.makePubliclyDecryptable(g.dealerSum);
        
        // Set continueFlag: 1 if dealerSum < 17, 0 otherwise
        g.continueFlag = FHE.select(
            FHE.lt(g.dealerSum, FHE.asEuint32(17)),
            FHE.asEuint32(1),
            FHE.asEuint32(0)
        );
        FHE.makePubliclyDecryptable(g.continueFlag);

        g.phase = Phase.DealerTurn;
        // Dealer hole card is hidden - only allow decrypt at end of game (in endGame function)
        // Don't allow here to maintain blackjack rules
        FHE.allowThis(g.dealerHoleCard); // Contract needs to use it, but player can't decrypt yet
    }

    function dealerHit(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.exists && g.phase == Phase.DealerTurn, "invalid state");
        require(g.deckIndex < 52, "deck empty");
        
        // Check if dealer should continue (dealerSum < 17)
        g.continueFlag = FHE.select(
            FHE.lt(g.dealerSum, FHE.asEuint32(17)),
            FHE.asEuint32(1),
            FHE.asEuint32(0)
        );
        FHE.makePubliclyDecryptable(g.continueFlag);
        FHE.makePubliclyDecryptable(g.dealerSum);
        
        // Only add card value if dealerSum < 17
        euint8 c = g.deck[g.deckIndex++];
        
        // Calculate what the sum would be after adding this card (with Ace handling)
        euint32 newBaseSum;
        euint32 newAceCount;
        euint32 sumAfterCard;
        (newBaseSum, newAceCount, sumAfterCard) = addCardToSum(g.dealerBaseSum, g.dealerAceCount, c);
        
        // If dealerSum >= 17, don't add the card (keep current sum, baseSum, and aceCount)
        // Otherwise, use the new sum with card added
        ebool shouldAddCard = FHE.lt(g.dealerSum, FHE.asEuint32(17));
        g.dealerBaseSum = FHE.select(shouldAddCard, newBaseSum, g.dealerBaseSum);
        g.dealerAceCount = FHE.select(shouldAddCard, newAceCount, g.dealerAceCount);
        g.dealerSum = FHE.select(shouldAddCard, sumAfterCard, g.dealerSum);

        // Allow contract to use updated baseSum and aceCount for future operations
        FHE.allowThis(g.dealerBaseSum);
        FHE.allowThis(g.dealerAceCount);

        // Allow player to decrypt dealerSum (for endGame comparison)
        FHE.allow(g.dealerSum, g.player);
        FHE.allowThis(g.dealerSum);
        FHE.makePubliclyDecryptable(c); // Make card publicly decryptable for verification
        
        // Off-chain should check continueFlag:
        // - If continueFlag == 0 (dealerSum >= 17), call endGame()
        // - If continueFlag == 1 (dealerSum < 17), can call dealerHit() again
    }

    /// @notice Set phase to GameEnding when player busts (called by off-chain after detecting bust)
    function setBustPhase(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.exists && g.player == msg.sender, "invalid player");
        require(g.phase == Phase.PlayerTurn, "wrong phase");
        g.phase = Phase.GameEnding;
    }

    function endGame(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.exists && (g.phase == Phase.GameEnding || g.phase == Phase.DealerTurn), "invalid state");

        FHE.makePubliclyDecryptable(g.playerCard1);
        FHE.makePubliclyDecryptable(g.playerCard2);
        
        // Now allow player to decrypt dealer hole card (end of game)
        // Make it publicly decryptable so no signature is needed
        FHE.allow(g.dealerHoleCard, g.player);
        FHE.makePubliclyDecryptable(g.dealerHoleCard);

        // Determine winner (off-chain will decrypt winFlag)
        g.winFlag = FHE.select(
            FHE.or(
                FHE.gt(g.playerSum, g.dealerSum),
                FHE.gt(g.dealerSum, FHE.asEuint32(21))
            ),
            FHE.asEuint32(1),
            FHE.asEuint32(0)
        );
        FHE.makePubliclyDecryptable(g.winFlag);
        // Off-chain: decrypt winFlag, payout accordingly
        g.phase = Phase.Completed;
    }

    /// @notice Claim payout sau khi off-chain xác định winFlag == 1
    /// @param gameId Game ID
    /// @param playerWon true nếu player thắng, false nếu thua
    /// @dev Frontend: 1) Decrypt winFlag, 2) Gọi payoutWinner với playerWon
    /// @dev Logic giống dice-game: reward = bet * multiplier (đã bao gồm bet trả lại + profit)
    /// @dev Nếu thắng: trả 2x bet = bet trả lại + 1x profit
    /// @dev Nếu thua: không trả gì (bet đã bị trừ trong startGame)
    function payoutWinner(
        uint256 gameId,
        bool playerWon
    ) external {
        Game storage g = games[gameId];
        require(g.exists, "no game");
        require(g.phase == Phase.Completed, "not finished");
        require(g.player == msg.sender, "only player can claim");
        
        if (playerWon) {
            // Reward = 2x bet (giống dice-game: bao gồm bet trả lại + 1x profit)
            // Ví dụ: bet 100 → reward = 200 (100 bet trả lại + 100 profit)
            uint256 reward = g.plainBetAmount * 2;
            
            // Cộng vào public balance (plain value)
            chipBalances[g.player] += reward;
        }
        // Nếu thua: bet đã bị trừ trong startGame(), không trả lại (giống dice-game)
    }

    // ============================================
    // VIEW FUNCTIONS - Game State
    // ============================================

    /// @notice Get complete game state (plain values + handles)
    /// @param gameId The game ID
    /// @return player Player address
    /// @return betAmountHandle Handle for encrypted bet amount (euint32, PRIVATE)
    /// @return deckIndex Current deck index
    /// @return phase Current phase
    /// @return exists Whether game exists
    /// @return playerSumHandle Handle for player sum (euint32)
    /// @return dealerSumHandle Handle for dealer sum (euint32)
    function getGameState(uint256 gameId)
        external
        view
        returns (
            address player,
            uint256 betAmountHandle,
            uint8 deckIndex,
            Phase phase,
            bool exists,
            uint256 playerSumHandle,
            uint256 dealerSumHandle
        )
    {
        Game storage g = games[gameId];
        return (
            g.player,
            uint256(euint32.unwrap(g.betAmount)), // 👈 Trả handle, không phải plain value
            g.deckIndex,
            g.phase,
            g.exists,
            uint256(euint32.unwrap(g.playerSum)),
            uint256(euint32.unwrap(g.dealerSum))
        );
    }

    /// @notice Get player cards handles
    /// @param gameId The game ID
    /// @return card1Handle Handle for player card 1 (euint8)
    /// @return card2Handle Handle for player card 2 (euint8)
    function getPlayerCards(uint256 gameId)
        external
        view
        returns (
            uint256 card1Handle,
            uint256 card2Handle
        )
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return (
            uint256(euint8.unwrap(g.playerCard1)),
            uint256(euint8.unwrap(g.playerCard2))
        );
    }

    /// @notice Get dealer cards handles
    /// @param gameId The game ID
    /// @return cardUpHandle Handle for dealer card up (euint8)
    /// @return holeCardHandle Handle for dealer hole card (euint8)
    function getDealerCards(uint256 gameId)
        external
        view
        returns (
            uint256 cardUpHandle,
            uint256 holeCardHandle
        )
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return (
            uint256(euint8.unwrap(g.dealerCardUp)),
            uint256(euint8.unwrap(g.dealerHoleCard))
        );
    }

    /// @notice Get player and dealer sums handles
    /// @param gameId The game ID
    /// @return playerSumHandle Handle for player sum (euint32)
    /// @return dealerSumHandle Handle for dealer sum (euint32)
    function getSums(uint256 gameId)
        external
        view
        returns (
            uint256 playerSumHandle,
            uint256 dealerSumHandle
        )
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return (
            uint256(euint32.unwrap(g.playerSum)),
            uint256(euint32.unwrap(g.dealerSum))
        );
    }

    /// @notice Get card handle from deck at specific index
    /// @param gameId The game ID
    /// @param index The deck index (0-51)
    /// @return cardHandle Handle for the card at that index
    function getDeckCard(uint256 gameId, uint8 index)
        external
        view
        returns (uint256 cardHandle)
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        require(index < 52, "Invalid deck index");
        return uint256(euint8.unwrap(g.deck[index]));
    }

    /// @notice Get bust flag handle (publicly decryptable)
    /// @param gameId The game ID
    /// @return bustFlagHandle Handle for bust flag (euint32, 1 if bust, 0 otherwise)
    function getBustFlag(uint256 gameId)
        external
        view
        returns (uint256 bustFlagHandle)
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return uint256(euint32.unwrap(g.bustFlag));
    }

    /// @notice Get win flag handle (publicly decryptable)
    /// @param gameId The game ID
    /// @return winFlagHandle Handle for win flag (euint32, 1 if player wins, 0 otherwise)
    function getWinFlag(uint256 gameId)
        external
        view
        returns (uint256 winFlagHandle)
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return uint256(euint32.unwrap(g.winFlag));
    }

    /// @notice Get continue flag handle (publicly decryptable)
    /// @param gameId The game ID
    /// @return continueFlagHandle Handle for continue flag (euint32, 1 if dealer should continue, 0 otherwise)
    function getContinueFlag(uint256 gameId)
        external
        view
        returns (uint256 continueFlagHandle)
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return uint256(euint32.unwrap(g.continueFlag));
    }

    /// @notice Get bet amount handle (PRIVATE - encrypted)
    /// @param gameId The game ID
    /// @return betAmountHandle Handle for encrypted bet amount (euint32)
    function getBetAmount(uint256 gameId)
        external
        view
        returns (uint256 betAmountHandle)
    {
        Game storage g = games[gameId];
        require(g.exists, "Game does not exist");
        return uint256(euint32.unwrap(g.betAmount));
    }

    /// @notice Allow contract to receive ETH (for liquidity khi user mua CHIP)
    receive() external payable {}
}