import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/animations.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { OrganizationProvider } from './contexts/OrganizationContext.jsx'
import { ThemePreferencesProvider } from './contexts/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <OrganizationProvider>
        <ThemePreferencesProvider>
          <App />
        </ThemePreferencesProvider>
      </OrganizationProvider>
    </AuthProvider>
  </StrictMode>,
)
