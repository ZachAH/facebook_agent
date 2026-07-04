import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/client.js';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = 'claude-sonnet-4-6';

// Per-post-type user prompts. The leading instruction nudges the format while
// the system prompt enforces voice + length rules.
const USER_PROMPTS = {
  tech_tip_tuesday:
    "Write a Tech Tip Tuesday post. Share one practical web or tech tip a small business owner would find genuinely useful. Lead with 'Tech Tip Tuesday:' or a variation.",
  wait_what_wednesday:
    "Write a Wait What Wednesday post. Share a surprising or counterintuitive fact about websites, SEO, or running a business online. Lead with 'Wait, what?' or a variation.",
  friday_weekend:
    'Write a feel-good Friday post to close out the work week. Warm, upbeat, and personal — like a quick note from a neighbor. Could be a weekend wish, a win from the week, a shoutout to Wisconsin, or a lighthearted question for followers. No tech tips, no sales pitch. Just good vibes heading into the weekend.',
  general:
    'Write a general Facebook post for ZH Web Solutions. Could be a relatable observation about running a small business online, a quick win or story from a client project, a question to spark engagement, or a reminder about why owning your website matters. Keep it natural and conversational — no forced themes, just something worth saying today.',
};

function buildSystemPrompt(voiceExamples) {
  const examples = voiceExamples.length
    ? voiceExamples.map((e) => e.content).join('\n---\n')
    : '(No examples saved yet — write in a grounded, plain-spoken, local small-business voice.)';

  return `You write Facebook posts for ZH Web Solutions, a solo web development
consultancy based in West Bend, WI run by Zach. The business builds
custom React websites and web apps for small businesses across Southeast
Wisconsin — no page builders, no platform lock-in, full asset ownership
for every client.

Match the owner's tone EXACTLY based on these real examples:
---
${examples}
---

Rules:
- Keep posts under 280 characters when possible, 400 max
- Sound like a real person, not a marketing department
- Local Wisconsin references are a plus
- No hashtag spam — 1-2 max if any
- No emojis unless the examples use them
- End with a subtle call to action or open question when it fits naturally`;
}

/**
 * Generate post copy for the given post type.
 * Fetches every saved voice example as few-shot tone reference, then asks Claude
 * for a single post. Returns the generated text string.
 *
 * An optional free-text `topic` steers what the post is about (e.g. "the
 * internet, with a case of the Mondays"). It's woven into the post while still
 * honoring the post type's format and the owner's voice.
 *
 * @param {'tech_tip_tuesday'|'wait_what_wednesday'|'friday_weekend'|'general'} postType
 * @param {string} [topic] optional subject/angle to steer the post
 * @returns {Promise<string>}
 */
export async function generatePost(postType, topic) {
  const basePrompt = USER_PROMPTS[postType];
  if (!basePrompt) {
    throw new Error(`Unknown post type: ${postType}`);
  }

  const trimmedTopic = typeof topic === 'string' ? topic.trim() : '';
  const userPrompt = trimmedTopic
    ? `${basePrompt}\n\nCenter this post on the following topic or angle: "${trimmedTopic}". Weave it in naturally — it should still read as a genuine post in the owner's voice, not a forced mashup.`
    : basePrompt;

  const { rows: voiceExamples } = await query(
    'SELECT content FROM voice_examples ORDER BY created_at ASC'
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(voiceExamples),
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Content agent returned an empty response');
  }

  return text;
}
