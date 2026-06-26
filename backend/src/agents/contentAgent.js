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
    'Write a casual Friday post. Light, conversational, end-of-week energy. Can be a reflection on the week, a weekend wish, a local WI shoutout, or a fun question for followers.',
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
 * @param {'tech_tip_tuesday'|'wait_what_wednesday'|'friday_weekend'} postType
 * @returns {Promise<string>}
 */
export async function generatePost(postType) {
  const userPrompt = USER_PROMPTS[postType];
  if (!userPrompt) {
    throw new Error(`Unknown post type: ${postType}`);
  }

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
