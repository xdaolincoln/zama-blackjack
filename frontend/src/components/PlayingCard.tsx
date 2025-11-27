import React from 'react';
import { CardData } from '../types';

interface PlayingCardProps {
    card: number | null;
    index: number;
    isHidden?: boolean;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({ card, index, isHidden = false }) => {
    // Convert card value and index to CardData format
    const getCardData = (cardValue: number | null, cardIndex: number): CardData | null => {
        if (cardValue === null) return null;
        
        // Map index to suit: 0=spades, 1=hearts, 2=diamonds, 3=clubs
        const suitIndex = cardIndex % 4;
        const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        
        return {
            value: cardValue,
            suit: suits[suitIndex],
            hidden: isHidden || false
        };
    };

    // Mapping logic to match standard card image file names
    // API Format: https://deckofcardsapi.com/static/img/{value}{suit}.png
    // Values: A, 2-9, 0 (for 10), J, Q, K
    // Suits: H, D, S, C
    const getValueCode = (val: number) => {
        if (val === 1) return 'A';
        if (val === 11) return 'J';
        if (val === 12) return 'Q';
        if (val === 13) return 'K';
        if (val === 10) return '0';
        return val.toString();
    };

    const getSuitCode = (suit: string) => {
        switch (suit) {
            case 'hearts': return 'H';
            case 'diamonds': return 'D';
            case 'spades': return 'S';
            case 'clubs': return 'C';
            default: return '';
        }
    };

    // Sizes increased by ~20-25%
    // Mobile: w-20 -> w-24 (6rem / 96px)
    // Desktop: sm:w-24 -> sm:w-32 (8rem / 128px)
    const cardSizeClasses = "w-24 h-36 sm:w-32 sm:h-48";

    const cardData = getCardData(card, index);

    if (isHidden || card === null || !cardData) {
        return (
            <div 
                className={`${cardSizeClasses} bg-blue-900 border-2 border-white rounded-xl shadow-2xl relative transform transition-transform duration-500 hover:-translate-y-2 flex items-center justify-center overflow-hidden`}
                style={{ 
                    backgroundImage: 'repeating-linear-gradient(45deg, #1e3a8a 0, #1e3a8a 10px, #172554 10px, #172554 20px)',
                    animationDelay: `${index * 100}ms`
                }}
            >
                <div className="absolute inset-2 border-2 border-blue-400/30 rounded-lg"></div>
                <div className="w-16 h-16 rounded-full bg-blue-950/50 flex items-center justify-center border border-blue-400/20 backdrop-blur-sm">
                    <div className="text-3xl text-blue-200/80">♠</div>
                </div>
            </div>
        );
    }

    const valueCode = getValueCode(cardData.value);
    const suitCode = getSuitCode(cardData.suit);
    const imageUrl = `https://deckofcardsapi.com/static/img/${valueCode}${suitCode}.png`;

    return (
        <div 
            className={`${cardSizeClasses} relative select-none transform transition-transform duration-300 animate-in fade-in slide-in-from-bottom-4 hover:-translate-y-4`}
            style={{ animationDelay: `${index * 150}ms` }}
        >
            <img 
                src={imageUrl} 
                alt={`${valueCode} of ${suitCode}`}
                className="w-full h-full object-contain filter drop-shadow-xl"
                draggable={false}
            />
        </div>
    );
};

