import { Toaster, toast } from 'react-hot-toast';

// Toast configuration component
export const ToastProvider = () => {
    return (
        <Toaster
            position="bottom-right"
            toastOptions={{
                duration: 4000,
                style: {
                    background: '#1e293b', // slate-800
                    color: '#ffffff',
                    border: '1px solid #334155', // slate-700
                    borderRadius: '0.75rem',
                    padding: '12px 16px',
                    fontSize: '14px',
                    maxWidth: '400px',
                },
                success: {
                    iconTheme: {
                        primary: '#10b981', // emerald-500
                        secondary: '#ffffff',
                    },
                    style: {
                        background: '#1e293b',
                        color: '#ffffff',
                        border: '1px solid #10b981',
                    },
                },
                error: {
                    iconTheme: {
                        primary: '#ef4444', // rose-500
                        secondary: '#ffffff',
                    },
                    style: {
                        background: '#1e293b',
                        color: '#ffffff',
                        border: '1px solid #ef4444',
                    },
                },
            }}
        />
    );
};

// Helper functions for toast notifications
export const showToast = {
    success: (message: string) => {
        toast.success(message);
    },
    
    error: (message: string) => {
        toast.error(message);
    },
    
    loading: (message: string) => {
        return toast.loading(message);
    },
    
    // Buy chips success toast
    buyChipsSuccess: (ethAmount: string) => {
        toast.success(
            <div className="flex items-center gap-2">
                <span>Bought chips with</span>
                <span className="font-bold">{ethAmount} ETH</span>
            </div>
        );
    },
    
    // Sell chips success toast
    sellChipsSuccess: (chipAmount: string) => {
        toast.success(
            <div className="flex items-center gap-2">
                <span>Sold</span>
                <span className="font-bold">{chipAmount} CHIP</span>
                <img src="/chip.svg" alt="Chip" className="w-4 h-4" />
            </div>
        );
    },
    
    // Withdraw ETH success toast
    withdrawSuccess: (ethAmount: string, address: string) => {
        toast.success(
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <span>Withdrawn</span>
                    <span className="font-bold">{ethAmount} ETH</span>
                </div>
                <div className="text-xs text-slate-400 truncate">
                    to {address.slice(0, 6)}...{address.slice(-4)}
                </div>
            </div>
        );
    },
    
    // You Win toast with chips
    youWin: (chipAmount: string) => {
        toast.success(
            <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-400">You Win!</span>
                <span className="font-bold">{chipAmount}</span>
                <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <img key={i} src="/chip.svg" alt="Chip" className="w-5 h-5" />
                    ))}
                </div>
            </div>,
            {
                duration: 6000,
                style: {
                    background: '#065f46', // emerald-900
                    color: '#ffffff',
                    border: '1px solid #10b981', // emerald-500
                },
            }
        );
    },
    
    // You Lose toast with chips
    youLose: (chipAmount: string) => {
        toast.error(
            <div className="flex items-center gap-2">
                <span className="font-bold text-rose-400">You Lose</span>
                <span className="font-bold">{chipAmount}</span>
                <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <img key={i} src="/chip.svg" alt="Chip" className="w-5 h-5" />
                    ))}
                </div>
            </div>,
            {
                duration: 6000,
                style: {
                    background: '#7f1d1d', // rose-900
                    color: '#ffffff',
                    border: '1px solid #ef4444', // rose-500
                },
            }
        );
    },
    
    // Push (tie) toast
    push: (chipAmount: string) => {
        toast(
            <div className="flex items-center gap-2">
                <span className="font-bold text-amber-400">Push</span>
                <span className="font-bold">{chipAmount} CHIP</span>
                <img src="/chip.svg" alt="Chip" className="w-5 h-5" />
            </div>,
            {
                duration: 6000,
                icon: '🤝',
                style: {
                    background: '#78350f', // amber-900
                    color: '#ffffff',
                    border: '1px solid #f59e0b', // amber-500
                },
            }
        );
    },
    
    dismiss: (toastId: string) => {
        toast.dismiss(toastId);
    },
};

