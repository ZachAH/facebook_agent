import { useEffect, useState } from 'react';
import api from '../api/client.js';

const TYPE_LABELS = {
  tech_tip_tuesday: 'Tech Tip Tuesday',
  wait_what_wednesday: 'Wait What Wednesday',
  friday_weekend: 'Friday',
};

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function fbLink(fbPostId) {
  // Graph API returns either {page}_{post} or a bare photo id.
  return `https://www.facebook.com/${fbPostId}`;
}

export default function History() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/posts')
      .then(({ data }) => {
        if (!active) return;
        // Everything that's no longer pending.
        setPosts(data.filter((p) => p.status !== 'pending'));
      })
      .catch(() => active && setError('Could not load history.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h1>History</h1>
      <p className="subtitle">Published &amp; rejected posts</p>

      {error && <div className="error-text">{error}</div>}

      {!loading && posts.length === 0 && !error && (
        <div className="empty">Nothing here yet.</div>
      )}

      {posts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Status</th>
              <th>Content</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>{TYPE_LABELS[p.post_type] || p.post_type}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>{p.content.slice(0, 80)}{p.content.length > 80 ? '…' : ''}</td>
                <td>
                  {p.fb_post_id ? (
                    <a href={fbLink(p.fb_post_id)} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
