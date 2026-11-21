import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <AppProvider>
        <App />
      </AppProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
)

