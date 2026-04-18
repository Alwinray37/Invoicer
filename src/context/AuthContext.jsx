import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// This file is the app's shared authentication state manager.
// It keeps track of the current signed-in user, exposes auth actions, and
// gives the rest of the app one place to read auth state through `useAuth()`.
// That way, individual pages do not each need to manage Supabase auth logic.

// React context lets us share auth data with any component in the app without
// manually passing `user`, `loading`, and auth functions through props.
const AuthContext = createContext({})

export function AuthProvider({ children }) {
  // AuthProvider wraps the app in `main.jsx`. Its job is to hold shared auth
  // state, expose auth helper functions, and keep React in sync with Supabase.
  const [user, setUser] = useState(null)

  // `loading` stays true until we know whether a saved session exists. This is
  // important so protected routes can wait instead of redirecting too early.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // First, check once on app load for an existing session stored by Supabase.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Then subscribe to future auth changes so sign-in/sign-out events update
    // the shared React state everywhere in the app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // These helpers are exposed through context so pages do not need to import
  // Supabase auth directly.
  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = (email, password) =>
    supabase.auth.signUp({ email, password })

  const signOut = () => supabase.auth.signOut()

  // Everything placed on this provider value becomes available to any child
  // component wrapped by AuthProvider, as long as it calls `useAuth()`.
  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// Components use this hook to read auth state and call auth actions without
// importing Supabase directly. It is the main public interface for this file.
export const useAuth = () => useContext(AuthContext)
