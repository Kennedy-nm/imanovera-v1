'use client';
import {useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const supabase = createClient();
    if (mode === 'in') {
      const {error} = await supabase.auth.signInWithPassword({email, password});
      if (error) setMessage(error.message);
      else {
        router.push('/');
        router.refresh();
      }
    } else {
      const {data, error} = await supabase.auth.signUp({email, password});
      if (error) setMessage(error.message);
      else if (data.session) {
        router.push('/');
        router.refresh();
      } else setMessage('Check your email to confirm your account, then sign in.');
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-3xl font-bold">Imanovera</h1>
      <p className="mt-1 text-gray-600">{mode === 'in' ? 'Sign in to continue' : 'Create your account'}</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          className="w-full rounded border p-3"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded border p-3"
          type="password"
          placeholder="Password (at least 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <button className="w-full rounded bg-blue-600 p-3 font-semibold text-white disabled:opacity-50" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      {message && <p className="mt-3 text-red-600">{message}</p>}
      <button className="mt-4 text-blue-700 underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </main>
  );
}