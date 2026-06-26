import { createCanvas } from 'canvas';
import { v2 as cloudinary } from 'cloudinary';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Facebook-optimal link/share image dimensions.
const WIDTH = 1200;
const HEIGHT = 630;

const NAVY = '#0F172A';
const WHITE = '#F8FAFC';
const MUTED = '#94A3B8';

const TEMPLATES = {
  tech_tip_tuesday: { accent: '#3B82F6', label: 'TECH TIP TUESDAY' },
  wait_what_wednesday: { accent: '#10B981', label: 'WAIT, WHAT?' },
};

/**
 * Wrap `text` into lines no wider than `maxWidth` pixels at the current font.
 */
function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Render the post content onto a branded canvas and return the local PNG path.
 */
function renderTemplate(content, template) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Accent bar down the left edge
  ctx.fillStyle = template.accent;
  ctx.fillRect(0, 0, 16, HEIGHT);

  // Top-left label
  ctx.fillStyle = template.accent;
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(template.label, 72, 96);

  // Auto-scaling body text, centered in the safe area.
  const maxTextWidth = WIDTH - 144; // 72px gutters
  const maxTextHeight = 360;
  let fontSize = 64;
  let lines = [];

  // Shrink font until the wrapped block fits both width and height budgets,
  // targeting ~60 chars per line as a starting point.
  while (fontSize >= 28) {
    ctx.font = `600 ${fontSize}px sans-serif`;
    lines = wrapLines(ctx, content, maxTextWidth);
    const lineHeight = fontSize * 1.3;
    if (lines.length * lineHeight <= maxTextHeight && lines.length <= 8) break;
    fontSize -= 4;
  }

  const lineHeight = fontSize * 1.3;
  const blockHeight = lines.length * lineHeight;
  let y = HEIGHT / 2 - blockHeight / 2 + fontSize;

  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  for (const line of lines) {
    ctx.fillText(line, WIDTH / 2, y);
    y += lineHeight;
  }

  // Footer
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'left';
  ctx.fillText('ZH Web Solutions', 72, HEIGHT - 56);

  ctx.font = '24px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('zachhowell.dev', WIDTH - 72, HEIGHT - 56);

  const filePath = join(tmpdir(), `${uuidv4()}.png`);
  writeFileSync(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

/**
 * Generate a branded image for the post (only for TTT and WWW post types),
 * upload it to Cloudinary, and return the secure URL. Returns null for post
 * types that are text-only (e.g. friday_weekend).
 *
 * @param {string} postType
 * @param {string} content
 * @returns {Promise<string|null>}
 */
export async function generateImage(postType, content) {
  const template = TEMPLATES[postType];
  if (!template) return null; // text-only post types get no image

  const filePath = renderTemplate(content, template);
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'zh-facebook-agent',
    });
    return result.secure_url;
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      /* best-effort temp cleanup */
    }
  }
}
