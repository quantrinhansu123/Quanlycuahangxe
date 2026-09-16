import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AttendanceSettingsProvider } from './context/AttendanceSettingsContext'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AttendanceSettingsProvider>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </AttendanceSettingsProvider>
    </AuthProvider>
  </StrictMode>,
)
