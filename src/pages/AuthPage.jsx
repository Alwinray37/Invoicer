import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  // One screen handles both login and account creation.
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Switch between auth actions based on the current mode.
    const fn = mode === 'login' ? signIn : signUp
    const { error: err } = await fn(email, password)
    setLoading(false)
    if (err) return setError(err.message)

    // Successful auth always returns the user to the main jobs screen.
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Logo */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-ink rounded-lg flex items-center justify-center">
              <div className="w-3 h-3 bg-accent rounded-sm" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Billable</span>
          </div>
          <p className="text-muted text-sm font-body">
            {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-xs font-body bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            className="btn-primary w-full justify-center flex items-center gap-2 mt-2"
            type="submit"
            disabled={loading}
          >
            {loading && <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-ink font-medium underline underline-offset-2"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
