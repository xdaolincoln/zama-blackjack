import { BlackjackGame } from './components/BlackjackGame'
import { ToastProvider } from './components/Toast'

function App() {
    return (
        <>
            <BlackjackGame />
            <ToastProvider />
        </>
    )
}

export default App
