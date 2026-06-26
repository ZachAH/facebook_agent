import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/login', { password });
      localStorage.setItem('zh_token', data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed.');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">
          ZH <span>Agent</span>
        </div>
        <p className="subtitle" style={{ textAlign: 'center' }}>
          Internal review console
        </p>

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />

        <button
          className="btn-primary"
          type="submit"
          style={{ width: '100%', marginTop: 16 }}
          disabled={busy || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <div className="error-text">{error}</div>}
      </form>
    </div>
  );
}
