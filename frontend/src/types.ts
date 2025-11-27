export interface CardData {
    value: number; // 1-13 (A, 2-10, J, Q, K)
    suit: string; // 'hearts', 'diamonds', 'spades', 'clubs'
    hidden?: boolean;
}

