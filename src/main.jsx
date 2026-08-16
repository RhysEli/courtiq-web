import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/animations.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { OrganizationProvider } from './contexts/OrganizationContext.jsx'
import { ThemePreferencesProvider } from './contexts/ThemeContext.jsx'
import { applyTheme } from './theme/applyTheme.js'
import { loadPersistedBrandColors } from './theme/brandColors.js'
import { loadPersistedUserPreference } from './theme/userPreference.js'

// Applied synchronously, before the first React render -- doing this in a
// component effect instead would run after the initial paint and flash
// default colors first for every returning, already-logged-in user.
// themeMode (light/dark/auto) isn't handled here -- it's resolved by
// ThemeContext itself from the SAME 'courtiq-preferences' localStorage key
// it always used, seeded at login (see authService.js); its initial
// useState computation also runs before first paint, just via React's own
// pre-render lazy-init rather than a raw DOM call like this one.
applyTheme({ brand: loadPersistedBrandColors() || {}, userPref: loadPersistedUserPreference() || {} })

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
