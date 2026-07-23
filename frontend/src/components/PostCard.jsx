import { useState } from 'react';
import api from '../api/client.js';
import ImagePreview from './ImagePreview.jsx';

const TYPE_LABELS = {
  tech_tip_tuesday: 'Tech Tip Tuesday',
  wait_what_wednesday: 'Wait What Wednesday',
  friday_weekend: 'Friday Feel-Good',
  general: 'General Post',
};

const QUALITY_LABELS = {
  length: 'Length',
  cta: 'CTA',
  repetition: 'Repetition',
  voiceFit: 'Voice fit',
};

function QualityPanel({ quality }) {
  if (!quality) return null;

  return (
    <div className="quality-panel">
      <div className="quality-summary">
        <span>Draft Quality</span>
        <strong>{quality.score}</strong>
        <span>{quality.grade}</span>
      </div>
      <div className="quality-checks">
        {Object.entries(quality.checks).map(([key, check]) => (
          <div key={key} className="quality-check">
            <div className="quality-check-top">
              <span>{QUALITY_LABELS[key] || key}</span>
              <strong>{check.score}</strong>
            </div>
            <div className="quality-bar" aria-hidden="true">
              <span style={{ width: `${check.score}%` }} />
            </div>
            <p>{check.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Draft preview with inline-editable content + approve/reject actions.
 * Optimistically removes the card from the parent list on action.
 */
export default function PostCard({ post, onResolved }) {
  const [draft, setDraft] = useState(post);
  const [content, setContent] = useState(post.content);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function saveEdit() {
    setEditing(false);
    if (content === draft.content) return;
    try {
      const { data } = await api.patch(`/posts/${post.id}`, { content });
      setDraft(data);
    } catch {
      setContent(draft.content); // revert on failure
      setError('Could not save edit.');
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/posts/${post.id}/approve`);
      if (data.ok === false) {
        setError(data.error || 'Publish failed.');
        setBusy(false);
        return;
      }
      onResolved(post.id); // optimistic removal
    } catch (err) {
      setError(err.response?.data?.error || 'Approve failed.');
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/posts/${post.id}/reject`);
      onResolved(post.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Reject failed.');
      setBusy(false);
    }
  }

  return (
    <div className="card post-card">
      <div className="row">
        <span className="badge badge-type">{TYPE_LABELS[post.post_type] || post.post_type}</span>
        <span className="badge badge-pending">Pending</span>
        <span className="char-count">{content.length} chars</span>
      </div>

      {editing ? (
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={saveEdit}
        />
      ) : (
        <div
          className="body"
          title="Click to edit"
          onClick={() => setEditing(true)}
        >
          {content}
        </div>
      )}

      <ImagePreview url={draft.image_url} />

      <QualityPanel quality={draft.quality} />

      <div className="actions">
        <button className="btn-approve" onClick={approve} disabled={busy}>
          ✓ Approve
        </button>
        <button className="btn-reject" onClick={reject} disabled={busy}>
          ✗ Reject
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
