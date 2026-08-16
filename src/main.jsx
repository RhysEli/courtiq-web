import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/animations.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { OrganizationProvider } from './contexts/OrganizationContext.jsx'
import { ThemePreferencesProvider } from './contexts/ThemeContext.jsx'
import { applyBrandColors, loadPersistedBrandColors } from './theme/brandColors.js'

// Applied synchronously, before the first React render -- doing this in a
// component effect instead would run after the initial paint and flash
// default colors first for every returning, already-logged-in user.
applyBrandColors(loadPersistedBrandColors() || {})

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
