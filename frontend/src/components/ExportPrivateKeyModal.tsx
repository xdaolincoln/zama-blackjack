import { useState } from 'react';
import { useAppWallet } from '../contexts/AppWalletContext';
import { X, Copy, AlertTriangle, Eye, EyeOff, Check } from 'lucide-react';

interface ExportPrivateKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ExportPrivateKeyModal = ({ isOpen, onClose }: ExportPrivateKeyModalProps) => {
    const { exportPrivateKey } = useAppWallet();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const handleExport = async () => {
        if (!password) {
            setError('Please enter your password');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const key = await exportPrivateKey(password);
            setPrivateKey(key);
            setPassword(''); // Clear password from memory
        } catch (err: any) {
            setError(err.message || 'Failed to export private key');
        } finally {
            setIsLoading(false);
        }
    };

    const copyPrivateKey = async () => {
        if (!privateKey) return;
        try {
            await navigator.clipboard.writeText(privateKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy private key:', error);
            setError('Failed to copy to clipboard');
        }
    };

    const handleClose = () => {
        setPassword('');
        setPrivateKey(null);
        setError(null);
        setConfirmed(false);
        setCopied(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6 mx-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">Export Private Key</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {!privateKey ? (
                    <>
                        {/* Security Warning */}
                        <div className="mb-4 p-4 bg-rose-900/20 border border-rose-800/50 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-rose-300">
                                    <p className="font-semibold mb-2">⚠️ Security Warning</p>
                                    <ul className="list-disc list-inside space-y-1 text-xs">
                                        <li>Never share your private key with anyone</li>
                                        <li>Anyone with your private key can access your wallet</li>
                                        <li>Do not screenshot or store it insecurely</li>
                                        <li>Only export if you need to import to another wallet</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Confirmation Checkbox */}
                        <div className="mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-2"
                                />
                                <span className="text-sm text-slate-300">
                                    I understand the risks and want to export my private key
                                </span>
                            </label>
                        </div>

                        {/* Password Input */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Enter Password to Verify
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && confirmed && password) {
                                            handleExport();
                                        }
                                    }}
                                    placeholder="Enter your wallet password"
                                    className="w-full bg-slate-900 border-2 border-slate-700 rounded-lg py-2 px-3 pr-10 text-white placeholder-slate-500 focus:border-emerald-500 outline-none transition-colors"
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

                        {error && (
                            <div className="mb-4 p-3 bg-rose-900/20 border border-rose-800/50 rounded-lg text-sm text-rose-300">
                                {error}
                            </div>
                        )}

                        {/* Export Button */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleClose}
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={!confirmed || !password || isLoading}
                                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                            >
                                {isLoading ? 'Exporting...' : 'Export Private Key'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Private Key Display */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Your Private Key
                            </label>
                            <div className="relative">
                                <textarea
                                    value={privateKey}
                                    readOnly
                                    className="w-full bg-slate-900 border-2 border-slate-700 rounded-lg py-2 px-3 pr-10 text-white font-mono text-sm resize-none"
                                    rows={3}
                                />
                                <button
                                    onClick={copyPrivateKey}
                                    className="absolute right-3 top-2 text-slate-400 hover:text-emerald-400 transition-colors"
                                    title="Copy private key"
                                >
                                    {copied ? (
                                        <Check className="w-5 h-5 text-emerald-400" />
                                    ) : (
                                        <Copy className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                            {copied && (
                                <p className="mt-2 text-xs text-emerald-400">Copied to clipboard!</p>
                            )}
                        </div>

                        {/* Final Warning */}
                        <div className="mb-4 p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
                            <p className="text-xs text-amber-300">
                                ⚠️ Keep this private key secure. Anyone with access to it can control your wallet.
                            </p>
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={handleClose}
                            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
                        >
                            Close
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

