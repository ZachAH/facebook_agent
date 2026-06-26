import { useEffect, useState } from 'react';
import api from '../api/client.js';
import PostCard from '../components/PostCard.jsx';

// The cron generates drafts Tue/Wed/Fri mornings (CT).
const NEXT_RUN_HINT = 'Tuesday, Wednesday, or Friday morning';

export default function Dashboard() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/posts', { params: { status: 'pending' } })
      .then(({ data }) => active && setPosts(data))
      .catch(() => active && setError('Could not load drafts.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function handleResolved(id) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <h1>Pending Drafts</h1>
      <p className="subtitle">
        {posts.length} draft{posts.length === 1 ? '' : 's'} awaiting review
      </p>

      {error && <div className="error-text">{error}</div>}

      {!loading && posts.length === 0 && !error && (
        <div className="empty">
          No drafts pending. Next generation runs on {NEXT_RUN_HINT}.
        </div>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} onResolved={handleResolved} />
      ))}
    </div>
  );
}
