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

export default function Dashboard() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genType, setGenType] = useState(defaultPostType);
  const [genError, setGenError] = useState(null);

  function loadPosts() {
    return api
      .get('/posts', { params: { status: 'pending' } })
      .then(({ data }) => setPosts(data))
      .catch(() => setError('Could not load drafts.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPosts();
  }, []);

  function handleResolved(id) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function generatePost(type) {
    setGenerating(true);
    setGenError(null);
    try {
      const { data } = await api.post('/posts/generate', { type: type || genType });
      setPosts((prev) => [data, ...prev]);
    } catch (err) {
      setGenError(err.response?.data?.error || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  function generateRandom() {
    const random = POST_TYPES[Math.floor(Math.random() * POST_TYPES.length)];
    setGenType(random.value);
    generatePost(random.value);
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
          <button className="btn-ghost" onClick={generateRandom} disabled={generating} title="Pick a random post type and generate">
            🎲 Random
          </button>
          {genError && <span className="error-text" style={{ fontSize: 13 }}>{genError}</span>}
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

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
