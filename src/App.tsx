import { Component, lazy, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { AuthProvider, useAuth } from './context/Auth'
import { WorkspaceProvider, useWorkspace } from './context/Workspace'
import { TimerProvider } from './context/Timer'
import { Login } from './components/Login'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { Button } from './components/ui'

const Workout = lazy(() => import('./pages/Workout').then(m => ({ default: m.Workout })))
const History = lazy(() => import('./pages/History').then(m => ({ default: m.History })))
const Progress = lazy(() => import('./pages/Progress').then(m => ({ default: m.Progress })))
const Program = lazy(() => import('./pages/Program').then(m => ({ default: m.Program })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

export default function App() { return <Boundary><HashRouter><AuthProvider><Application /></AuthProvider></HashRouter></Boundary> }
function Application() {
  const { identity, loading } = useAuth()
  if (loading) return <div className="app-loading"><span className="loader" /><strong>Workout Lab</strong><span>Ετοιμάζουμε τον χώρο σας…</span></div>
  if (!identity || new URLSearchParams(location.search).has('recovery')) return <Login />
  return <WorkspaceProvider key={`${identity.teamId}:${identity.userId}`}><TimerProvider><Routes><Route element={<Shell />}><Route index element={<Dashboard />} /><Route path="workout/:id" element={<Workout />} /><Route path="history" element={<History />} /><Route path="progress" element={<Progress />} /><Route path="program" element={<Program />} /><Route path="settings" element={<Settings />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes><UpdateNotice /></TimerProvider></WorkspaceProvider>
}
function UpdateNotice() {
  const { data } = useWorkspace(), { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()
  const active = data.workouts.some(w => w.status === 'active')
  if (!needRefresh) return null
  return <div className="update-notice"><span>{active ? 'Νέα έκδοση διαθέσιμη μετά την προπόνηση.' : 'Μια νέα έκδοση είναι διαθέσιμη.'}</span><Button size="small" disabled={active} onClick={() => void updateServiceWorker(true)}>Ενημέρωση</Button></div>
}
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <div className="app-loading"><strong>Δεν ήταν δυνατή η φόρτωση.</strong><p>Ελέγξτε ότι επιτρέπεται η αποθήκευση στη συσκευή και δοκιμάστε ξανά. Οι προηγούμενες καταγραφές δεν διαγράφονται.</p><Button onClick={() => location.reload()}>Επαναφόρτωση</Button></div> : this.props.children }
}
