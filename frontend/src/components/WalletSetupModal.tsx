import { useState } from 'react';
import { useAppWallet } from '../contexts/AppWalletContext';
import { Copy, Check, Lock } from 'lucide-react';

interface WalletSetupModalProps {
    onComplete: () => void;
}

export const WalletSetupModal = ({ onComplete }: WalletSetupModalProps) => {
    const { createWallet, address, isLoading, error } = useAppWallet();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCreate = async () => {
        if (password.length < 6) {
            return;
        }

        if (password !== confirmPassword) {
            return;
        }

        try {
            await createWallet(password);
            onComplete();
        } catch (err: any) {
            // Error is already handled in context
        }
    };

    const copyAddress = async () => {
        if (!address) return;
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy address:', error);
        }
    };

    if (address) {
        // Wallet created, show address
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-emerald-600 rounded-full mx-auto flex items-center justify-center mb-4">
                            <Check className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Wallet Created!</h2>
                        <p className="text-slate-400 text-sm">Your app wallet is ready to use</p>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
                        <label className="text-xs text-slate-400 mb-2 block">Your Wallet Address</label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-mono text-emerald-400 break-all">
                                {address}
                            </code>
                            <button
                                onClick={copyAddress}
                                className="p-2 hover:bg-slate-700 rounded transition-colors"
                                title="Copy address"
                            >
                                {copied ? (
                                    <Check className="w-4 h-4 text-emerald-400" />
                                ) : (
                                    <Copy className="w-4 h-4 text-slate-400" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 mb-4">
                        <p className="text-xs text-amber-300">
                            <strong>Important:</strong> Send Sepolia ETH to this address to fund your wallet. 
                            You can use MetaMask or any other wallet to send ETH.
                        </p>
                    </div>

                    <button
                        onClick={onComplete}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                        Continue
                    </button>
                </div>
            </div>
        );
    }

    // Show password input form
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Create App Wallet</h2>
                    <p className="text-slate-400 text-sm">Set a password to encrypt your wallet</p>
                </div>

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
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter password (min 6 characters)"
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Confirm Password
                        </label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Confirm password"
                            disabled={isLoading}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleCreate();
                                }
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="showPassword"
                            checked={showPassword}
                            onChange={(e) => setShowPassword(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="showPassword" className="text-sm text-slate-400">
                            Show password
                        </label>
                    </div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
                    <p className="text-xs text-slate-400">
                        <strong>Note:</strong> Your wallet will be encrypted and stored locally. 
                        Make sure to remember your password - it cannot be recovered!
                    </p>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={isLoading || !password || !confirmPassword}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Creating Wallet...' : 'Create Wallet'}
                </button>
            </div>
        </div>
    );
};

