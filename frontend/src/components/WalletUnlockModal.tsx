import { useState } from 'react';
import { useAppWallet } from '../contexts/AppWalletContext';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface WalletUnlockModalProps {
    onUnlock: () => void;
}

export const WalletUnlockModal = ({ onUnlock }: WalletUnlockModalProps) => {
    const { unlockWallet, address, isLoading, error } = useAppWallet();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleUnlock = async () => {
        if (!password) {
            return;
        }

        try {
            await unlockWallet(password);
            onUnlock();
        } catch (err: any) {
            // Error is already set in context
            console.error('Unlock error:', err);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Unlock Wallet</h2>
                    <p className="text-slate-400 text-sm">Enter your password to unlock your wallet</p>
                </div>

                {address && (
                    <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-slate-400 mb-1">Wallet Address</p>
                        <code className="text-xs font-mono text-emerald-400 break-all">
                            {address}
                        </code>
                    </div>
                )}

                {error && (
                    <div className="bg-rose-900/20 border border-rose-700/50 rounded-lg p-3 mb-4">
                        <p className="text-sm text-rose-300">{error}</p>
                    </div>
                )}

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter your password"
                                disabled={isLoading}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleUnlock();
                                    }
                                }}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                ) : (
                                    <Eye className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleUnlock}
                    disabled={isLoading || !password}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Unlocking...' : 'Unlock Wallet'}
                </button>
            </div>
        </div>
    );
};

