import { useEffect, useState } from 'react';
import api from '../api/client.js';
import PostCard from '../components/PostCard.jsx';

const POST_TYPES = [
  { value: 'tech_tip_tuesday', label: 'Tech Tip Tuesday', day: 2 },
  { value: 'wait_what_wednesday', label: 'Wait What Wednesday', day: 3 },
  { value: 'friday_weekend', label: 'Friday Feel-Good', day: 5 },
  { value: 'general', label: 'General Post', day: null },
];

function defaultPostType() {
  const day = new Date().getDay(); // 0=Sun … 6=Sat
  const match = POST_TYPES.find((t) => t.day === day);
  return match ? match.value : 'tech_tip_tuesday';
}

function formatPercent(value) {
  return value === null || value === undefined ? 'N/A' : `${value}%`;
}

function formatMinutes(value) {
  if (value === null || value === undefined) return 'N/A';
  if (value < 1) return '<1 min';
  return `${Math.round(value)} min`;
}

export default function Dashboard() {
  const [posts, setPosts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genType, setGenType] = useState(defaultPostType);
  const [genTopic, setGenTopic] = useState('');
  const [genError, setGenError] = useState(null);

  function loadPosts() {
    return api
      .get('/posts', { params: { status: 'pending' } })
      .then(({ data }) => setPosts(data))
      .catch(() => setError('Could not load drafts.'))
      .finally(() => setLoading(false));
  }

  function loadMetrics() {
    return api
      .get('/posts/metrics')
      .then(({ data }) => setMetrics(data))
      .catch(() => setMetrics(null));
  }

  useEffect(() => {
    loadPosts();
    loadMetrics();
  }, []);

  function handleResolved(id) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    loadMetrics();
  }

  async function generatePost(type) {
    setGenerating(true);
    setGenError(null);
    try {
      const topic = genTopic.trim();
      const { data } = await api.post('/posts/generate', {
        type: type || genType,
        ...(topic ? { topic } : {}),
      });
      setPosts((prev) => [data, ...prev]);
      loadMetrics();
    } catch (err) {
      setGenError(err.response?.data?.error || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  function generateRandom() {
    generatePost(genType);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        <div>
          <h1>Pending Drafts</h1>
          <p className="subtitle">
            {posts.length} draft{posts.length === 1 ? '' : 's'} awaiting review
          </p>
        </div>

        <div className="card" style={{ padding: '14px 18px', margin: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={genType}
            onChange={(e) => setGenType(e.target.value)}
            disabled={generating}
          >
            {POST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={() => generatePost()} disabled={generating}>
            {generating ? 'Generating…' : '+ Generate Draft'}
          </button>
          <button className="btn-ghost" onClick={generateRandom} disabled={generating} title="Generate a variation of the selected type">
            🎲 Random
          </button>
          <input
            type="text"
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
            disabled={generating}
            placeholder="Optional topic or angle — e.g. the internet, with a case of the Mondays"
            title="Steer what the post is about. Leave blank for a standard post."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating) generatePost();
            }}
            style={{ flex: '1 1 260px', minWidth: 200 }}
          />
          {genError && <span className="error-text" style={{ fontSize: 13 }}>{genError}</span>}
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {metrics && (
        <div className="metrics-grid" aria-label="Production signals">
          <div className="metric-card">
            <span className="metric-label">Published</span>
            <strong>{metrics.totals.published}</strong>
            <span>{metrics.totals.total} total drafts</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Approval Rate</span>
            <strong>{formatPercent(metrics.approvalRate)}</strong>
            <span>published vs. resolved</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Avg. Time To Live</span>
            <strong>{formatMinutes(metrics.avgPublishMinutes)}</strong>
            <span>draft created to published</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Failures</span>
            <strong>{metrics.totals.failed}</strong>
            <span>{formatPercent(metrics.failureRate)} of resolved drafts</span>
          </div>
        </div>
      )}

      {!loading && posts.length === 0 && !error && (
        <div className="empty">
          No drafts pending. Use "Generate Draft" above or wait for the scheduled run on Tuesday, Wednesday, or Friday morning.
        </div>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} onResolved={handleResolved} />
      ))}
    </div>
  );
}
