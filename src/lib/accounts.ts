import { cloud } from './cloud'
import type { AthleteId } from './model'

export interface ManagedUser {
  id: string; name: string; email: string; role: 'coach' | 'athlete' | 'spectator';
  athleteId: AthleteId | null; createdAt: string; lastSignIn: string | null
}
export type AccountAction = { action: 'list' } | { action: 'delete'; userId: string } | { action: 'password'; userId: string; password: string } | { action: 'create'; name: string; email: string; password: string; role: 'athlete' | 'spectator'; athleteId: AthleteId | null }
const messages: Record<string, string> = {
  not_authenticated: 'Συνδεθείτε ξανά για να διαχειριστείτε τους λογαριασμούς.',
  not_authorized: 'Η διαχείριση χρηστών επιτρέπεται μόνο στον προπονητή.',
  account_not_found: 'Ο λογαριασμός δεν είναι διαθέσιμος. Ανανεώστε τη λίστα.',
  protected_coach: 'Ο λογαριασμός του προπονητή προστατεύεται από αυτή την ενέργεια.',
  athlete_has_account: 'Αυτή η αθλήτρια έχει ήδη λογαριασμό. Ανανεώστε τη λίστα.',
  email_exists: 'Αυτό το email χρησιμοποιείται ήδη στο Supabase. Δεν συνδέθηκε νέος λογαριασμός.',
  invalid_password: 'Ο νέος κωδικός πρέπει να έχει 8–128 χαρακτήρες.',
  weak_password: 'Ο κωδικός δεν πληροί τους κανόνες του Supabase. Χρησιμοποιήστε ισχυρότερο κωδικό.',
  same_password: 'Επιλέξτε διαφορετικό νέο κωδικό.',
  invalid_account: 'Ελέγξτε το όνομα και το email του λογαριασμού.',
  creation_cleanup_failed: 'Η δημιουργία δεν ολοκληρώθηκε. Ελέγξτε τους χρήστες στο Supabase πριν δοκιμάσετε ξανά.',
}
export async function manageAccounts(input: AccountAction): Promise<{ users?: ManagedUser[] }> {
  if (!cloud || !navigator.onLine) throw new Error('Η διαχείριση χρηστών χρειάζεται σύνδεση στο cloud.')
  const { data, error } = await cloud.functions.invoke('manage-users', { body: input })
  if (error) {
    let code: string | undefined
    if (error.context instanceof Response) {
      try { code = (await error.context.json()).error } catch { /* gateway / undeployed function */ }
    }
    throw new Error(messages[code || ''] || 'Η διαχείριση χρηστών δεν ανταποκρίνεται. Ελέγξτε ότι έχει ενεργοποιηθεί στο Supabase και ανανεώστε τη λίστα πριν επαναλάβετε την ενέργεια.')
  }
  return data
}
