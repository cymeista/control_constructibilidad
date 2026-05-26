import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { AppDataProvider } from './context/AppDataContext'
import { AuthProvider } from './security/AuthContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AuthProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </AuthProvider>
  </HashRouter>,
)
