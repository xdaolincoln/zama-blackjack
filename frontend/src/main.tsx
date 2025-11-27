import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AppWalletProvider } from './contexts/AppWalletContext.tsx'
import { FhevmProvider } from './components/FhevmProvider.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AppWalletProvider>
            <FhevmProvider>
                <App />
            </FhevmProvider>
        </AppWalletProvider>
    </React.StrictMode>,
)
