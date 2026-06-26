import { useEffect, useState } from 'react';
import api from '../api/client.js';

const SCHEDULE_FIELDS = [
  { key: 'post_time_tuesday', label: 'Tuesday' },
  { key: 'post_time_wednesday', label: 'Wednesday' },
  { key: 'post_time_friday', label: 'Friday' },
];

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [examples, setExamples] = useState([]);
  const [newExample, setNewExample] = useState('');
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => {
        const map = {};
        for (const s of data.settings) map[s.key] = s.value;
        setSettings(map);
        setExamples(data.voiceExamples);
      })
      .catch(() => setError('Could not load settings.'));
  }, []);

  function setSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setScheduleSaved(false);
  }

  async function saveSchedule() {
    setError(null);
    try {
      const payload = {};
      for (const f of SCHEDULE_FIELDS) payload[f.key] = settings[f.key];
      await api.patch('/settings', payload);
      setScheduleSaved(true);
    } catch {
      setError('Could not save schedule.');
    }
  }

  async function toggleSms() {
    const next = settings.sms_active === 'true' ? 'false' : 'true';
    setSetting('sms_active', next);
    try {
      await api.patch('/settings', { sms_active: next });
    } catch {
      setError('Could not update SMS setting.');
    }
  }

  async function addExample() {
    if (!newExample.trim()) return;
    try {
      const { data } = await api.post('/settings/voice-examples', {
        content: newExample.trim(),
      });
      setExamples((prev) => [data, ...prev]);
      setNewExample('');
    } catch {
      setError('Could not add example.');
    }
  }

  async function deleteExample(id) {
    try {
      await api.delete(`/settings/voice-examples/${id}`);
      setExamples((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError('Could not delete example.');
    }
  }

  async function runHealthCheck() {
    setHealthLoading(true);
    setHealth(null);
    try {
      const { data } = await api.get('/settings/health-check');
      setHealth(data);
    } catch {
      setError('Health check failed.');
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="subtitle">Schedule, voice, and integration health</p>

      {error && <div className="error-text">{error}</div>}

      {/* Section 1: Schedule */}
      <div className="card">
        <h2 className="section-title">Post schedule (Central Time)</h2>
        <div className="field-row">
          {SCHEDULE_FIELDS.map((f) => (
            <div key={f.key}>
              <label>{f.label}</label>
              <input
                type="time"
                value={settings[f.key] || ''}
                onChange={(e) => setSetting(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn-primary" onClick={saveSchedule}>
            Save schedule
          </button>
          <button className="btn-ghost" onClick={toggleSms}>
            SMS approvals: {settings.sms_active === 'true' ? 'On' : 'Off'}
          </button>
          {scheduleSaved && <span style={{ color: 'var(--green)', fontSize: 13 }}>Saved ✓</span>}
        </div>
      </div>

      {/* Section 2: Voice examples */}
      <div className="card">
        <h2 className="section-title">Voice examples</h2>
        <p className="subtitle" style={{ marginBottom: 14 }}>
          Real posts Claude uses as tone reference.
        </p>

        <textarea
          placeholder="Paste a real post that sounds like you…"
          value={newExample}
          onChange={(e) => setNewExample(e.target.value)}
        />
        <button
          className="btn-primary"
          style={{ marginTop: 10 }}
          onClick={addExample}
          disabled={!newExample.trim()}
        >
          Add example
        </button>

        <div style={{ marginTop: 18 }}>
          {examples.length === 0 && (
            <p className="subtitle">No examples saved yet.</p>
          )}
          {examples.map((ex) => (
            <div key={ex.id} className="example-item">
              <p>{ex.content}</p>
              <button className="btn-reject" onClick={() => deleteExample(ex.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Token health */}
      <div className="card">
        <h2 className="section-title">Integration health</h2>
        <button className="btn-ghost" onClick={runHealthCheck} disabled={healthLoading}>
          {healthLoading ? 'Checking…' : 'Test connections'}
        </button>

        {health && (
          <div style={{ marginTop: 14 }}>
            <div className="health-line">
              <span className={`dot ${health.facebook.ok ? 'dot-ok' : 'dot-bad'}`} />
              Facebook Graph API —{' '}
              {health.facebook.ok
                ? `connected (${health.facebook.page})`
                : `error: ${health.facebook.error}`}
            </div>
            <div className="health-line">
              <span className={`dot ${health.twilio.ok ? 'dot-ok' : 'dot-bad'}`} />
              Twilio —{' '}
              {health.twilio.ok
                ? `active`
                : `error: ${health.twilio.error || health.twilio.status}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
