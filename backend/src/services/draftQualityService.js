import { query } from '../db/client.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'if',
  'in',
  'is',
  'it',
  'its',
  'just',
  'of',
  'on',
  'or',
  'our',
  'so',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'we',
  'when',
  'with',
  'you',
  'your',
]);

const CTA_PATTERNS = [
  /\?$/,
  /\b(call|message|reach out|send|ask|need help|want help|let's talk|ready to)\b/i,
  /\b(what do you think|have you|when was the last time|worth checking)\b/i,
];

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function uniqueTokens(text) {
  return new Set(tokenize(text));
}

function jaccardSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function scoreLength(content) {
  const length = content.length;
  if (length <= 280) {
    return { score: 100, note: `${length} characters; ideal for Facebook scanning.` };
  }
  if (length <= 400) {
    return { score: 80, note: `${length} characters; acceptable but slightly long.` };
  }
  return { score: 45, note: `${length} characters; likely too long for this format.` };
}

function scoreCta(content) {
  const hasCta = CTA_PATTERNS.some((pattern) => pattern.test(content.trim()));
  return hasCta
    ? { score: 100, note: 'Has a question or soft call to action.' }
    : { score: 55, note: 'No clear question or soft call to action detected.' };
}

function scoreRepetition(content, recentPosts) {
  if (!recentPosts.length) {
    return { score: 100, note: 'No recent same-type posts to compare.' };
  }

  const contentTokens = uniqueTokens(content);
  const maxSimilarity = Math.max(
    ...recentPosts.map((post) => jaccardSimilarity(contentTokens, uniqueTokens(post.content)))
  );

  if (maxSimilarity < 0.18) {
    return { score: 100, note: 'Low similarity to recent same-type drafts.' };
  }
  if (maxSimilarity < 0.32) {
    return { score: 75, note: 'Some overlap with a recent same-type draft.' };
  }
  return { score: 45, note: 'High overlap with recent same-type content.' };
}

function scoreVoiceFit(content, voiceExamples) {
  if (!voiceExamples.length) {
    return { score: 70, note: 'No saved tone guidance yet; using default voice rules.' };
  }

  const contentTokens = uniqueTokens(content);
  const voiceTokens = uniqueTokens(voiceExamples.map((example) => example.content).join(' '));
  const overlap = jaccardSimilarity(contentTokens, voiceTokens);

  if (overlap >= 0.12) {
    return { score: 95, note: 'Strong overlap with saved tone guidance.' };
  }
  if (overlap >= 0.06) {
    return { score: 80, note: 'Moderate overlap with saved tone guidance.' };
  }
  return { score: 60, note: 'Limited overlap with saved tone guidance.' };
}

function gradeForScore(score) {
  if (score >= 90) return 'Strong';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs review';
  return 'Risky';
}

export async function evaluateDraftQuality(post) {
  const [voiceResult, recentResult] = await Promise.all([
    query('SELECT content FROM voice_examples ORDER BY created_at DESC LIMIT 25'),
    query(
      `SELECT content FROM posts
        WHERE post_type = $1
          AND id <> $2
        ORDER BY created_at DESC
        LIMIT 6`,
      [post.post_type, post.id]
    ),
  ]);

  const checks = {
    length: scoreLength(post.content),
    cta: scoreCta(post.content),
    repetition: scoreRepetition(post.content, recentResult.rows),
    voiceFit: scoreVoiceFit(post.content, voiceResult.rows),
  };

  const score = Math.round(
    Object.values(checks).reduce((sum, check) => sum + check.score, 0) /
      Object.keys(checks).length
  );

  return {
    score,
    grade: gradeForScore(score),
    checks,
  };
}

export async function attachDraftQuality(posts) {
  return Promise.all(
    posts.map(async (post) => ({
      ...post,
      quality: await evaluateDraftQuality(post),
    }))
  );
}
