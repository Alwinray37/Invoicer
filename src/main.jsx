import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import './index.css'

import AuthPage    from './pages/AuthPage'
import JobsPage    from './pages/JobsPage'
import JobDashboard from './pages/JobDashboard'
import InvoicePage from './pages/InvoicePage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? children : <Navigate to="/auth" replace />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<PrivateRoute><JobsPage /></PrivateRoute>} />
          <Route path="/jobs/:jobId" element={<PrivateRoute><JobDashboard /></PrivateRoute>} />
          <Route path="/jobs/:jobId/invoice/:invoiceId" element={<PrivateRoute><InvoicePage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
