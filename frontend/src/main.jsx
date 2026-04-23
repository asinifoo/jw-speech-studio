import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConfirmProvider } from './providers/ConfirmProvider'
import { AlertProvider } from './providers/AlertProvider'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfirmProvider>
      <AlertProvider>
        <App />
      </AlertProvider>
    </ConfirmProvider>
  </React.StrictMode>
)
