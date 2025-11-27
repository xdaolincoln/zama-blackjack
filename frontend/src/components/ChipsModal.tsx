import React, { useState } from 'react';
import { X, ArrowLeftRight } from 'lucide-react';
import { formatEther } from 'ethers';
import { showToast } from './Toast';

interface ChipsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBuy: (ethAmount: bigint) => Promise<void>;
    onSell: (chipAmount: bigint) => Promise<void>;
    onWithdraw?: (ethAmount: bigint, toAddress: string) => Promise<void>;
    balance: bigint; // CHIP balance
    ethBalance: bigint; // ETH balance
    loading?: boolean;
}

export const ChipsModal: React.FC<ChipsModalProps> = ({ 
    isOpen, 
    onClose, 
    onBuy, 
    onSell,
    onWithdraw,
    balance,
    ethBalance,
    loading = false 
}) => {
    const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'withdraw'>('buy');
    const [buyAmount, setBuyAmount] = useState<string>('0.1');
    const [sellAmount, setSellAmount] = useState<string>('');
    const [withdrawAmount, setWithdrawAmount] = useState<string>('');
    const [withdrawAddress, setWithdrawAddress] = useState<string>('');

    if (!isOpen) return null;

    const handleBuy = async () => {
        if (!buyAmount || parseFloat(buyAmount) <= 0) {
            return;
        }
        try {
            const { parseEther } = await import('ethers');
            const ethAmount = parseEther(buyAmount);
            await onBuy(ethAmount);
            setBuyAmount('');
            // Show success toast
            showToast.buyChipsSuccess(buyAmount);
        } catch (error: any) {
            console.error('Buy chips error:', error);
        }
    };

    const handleSell = async () => {
        if (!sellAmount || parseFloat(sellAmount) <= 0) {
            return;
        }
        try {
            const chipAmount = BigInt(sellAmount);
            if (chipAmount > balance) {
                return;
            }
            await onSell(chipAmount);
            // Format chip amount with commas
            const formattedAmount = chipAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            setSellAmount('');
            // Show success toast
            showToast.sellChipsSuccess(formattedAmount);
        } catch (error: any) {
            console.error('Sell chips error:', error);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <ArrowLeftRight className="w-5 h-5 text-white" />
                        <h2 className="text-xl font-bold text-white">Cashier</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab('buy')}
                        className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${
                            activeTab === 'buy'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                    >
                        Buy Chips
                    </button>
                    <button
                        onClick={() => setActiveTab('sell')}
                        className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${
                            activeTab === 'sell'
                                ? 'bg-[#D97706] text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                    >
                        Sell Chips
                    </button>
                    {onWithdraw && (
                        <button
                            onClick={() => setActiveTab('withdraw')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors ${
                                activeTab === 'withdraw'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                        >
                            Withdraw
                        </button>
                    )}
                </div>

                {/* Current Balances */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="text-center bg-slate-900/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400 mb-1">CHIP Balance</p>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-xl font-bold text-white">{balance.toString()}</span>
                            <span className="text-sm font-bold text-amber-500">CHIPS</span>
                        </div>
                    </div>
                    <div className="text-center bg-slate-900/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400 mb-1">ETH Balance</p>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-xl font-bold text-white">
                                {parseFloat(formatEther(ethBalance)).toFixed(4)}
                            </span>
                            <span className="text-sm font-bold text-blue-400">ETH</span>
                        </div>
                    </div>
                </div>

                {/* Content based on active tab */}
                {activeTab === 'buy' ? (
                    <div>
                        <label className="block text-sm text-white mb-2">Amount (ETH)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={buyAmount}
                            onChange={(e) => setBuyAmount(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 mb-2"
                            placeholder="0.1"
                        />
                        <p className="text-xs text-slate-400 mb-6">Rate: 1 ETH = 10,000 CHIPS</p>
                        <button
                            onClick={handleBuy}
                            disabled={loading || !buyAmount || parseFloat(buyAmount) <= 0}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Processing...' : 'Purchase Chips'}
                        </button>
                    </div>
                ) : activeTab === 'sell' ? (
                    <div>
                        <label className="block text-sm text-white mb-2">Amount (CHIPS)</label>
                        <input
                            type="number"
                            value={sellAmount}
                            onChange={(e) => setSellAmount(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 mb-2"
                            placeholder="Enter CHIP amount"
                        />
                        <p className="text-xs text-slate-400 mb-6">Rate: 10,000 CHIPS = 1 ETH</p>
                        <button
                            onClick={handleSell}
                            disabled={loading || !sellAmount || BigInt(sellAmount || '0') > balance || BigInt(sellAmount || '0') <= 0}
                            className="w-full bg-[#D97706] hover:bg-[#B45309] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Processing...' : 'Sell Chips'}
                        </button>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm text-white mb-2">To Address (OEA Wallet)</label>
                        <input
                            type="text"
                            value={withdrawAddress}
                            onChange={(e) => setWithdrawAddress(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 mb-3 font-mono text-sm"
                            placeholder="0x..."
                        />
                        <label className="block text-sm text-white mb-2">Amount (ETH)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 mb-2"
                            placeholder="0.1"
                        />
                        <p className="text-xs text-slate-400 mb-6">Withdraw ETH from app wallet to external wallet</p>
                        <button
                            onClick={async () => {
                                if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
                                    return;
                                }
                                if (!withdrawAddress || !withdrawAddress.startsWith('0x') || withdrawAddress.length !== 42) {
                                    return;
                                }
                                try {
                                    const { parseEther } = await import('ethers');
                                    const ethAmount = parseEther(withdrawAmount);
                                    if (onWithdraw) {
                                        await onWithdraw(ethAmount, withdrawAddress);
                                        // Show success toast
                                        showToast.withdrawSuccess(withdrawAmount, withdrawAddress);
                                        setWithdrawAmount('');
                                        setWithdrawAddress('');
                                    }
                                } catch (error: any) {
                                    console.error('Withdraw error:', error);
                                }
                            }}
                            disabled={loading || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !withdrawAddress || withdrawAddress.length !== 42 || !onWithdraw}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Processing...' : 'Withdraw ETH'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

