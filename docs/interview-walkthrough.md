# Interview Walkthrough: ZH Facebook Automation Agent

## One-Minute Summary

ZH Facebook Automation Agent is a production full-stack AI workflow for creating, reviewing, and publishing Facebook posts for ZH Web Solutions. The product solves a real small-business problem: consistent, on-brand social content is valuable, but manual ideation, writing, formatting, and posting are easy to skip.

The app uses an LLM to draft posts in the owner's voice, renders branded graphics for recurring content types, stores drafts in Postgres, sends push/SMS review notifications, and publishes approved content through the Facebook Graph API. A React PWA gives the owner a mobile-friendly dashboard for review, editing, approval, rejection, settings, voice examples, and integration health.

## Customer Opportunity

- Small-business owners need a consistent online presence but do not have time to plan, write, and publish every post manually.
- Fully automated publishing is risky because brand voice, factual accuracy, and timing still need human judgment.
- The product creates a human-in-the-loop workflow: AI handles draft generation and formatting, while the owner keeps final control.

## Architecture

- **Frontend:** React and Vite PWA with authenticated dashboard, pending draft review, history, settings, push notification subscription, and operational metrics.
- **Backend:** Node.js, Express, PostgreSQL, cron scheduling, JWT auth, and service modules for AI generation, image rendering, notifications, Twilio, and Facebook publishing.
- **AI layer:** Anthropic SDK with structured system prompts, saved voice examples as few-shot context, rotating topics, and recent-post avoidance.
- **Publishing layer:** Facebook Graph API integration for text posts and image posts, with status updates and stored Facebook post IDs.
- **Notification layer:** Web Push for mobile/desktop notifications and optional Twilio SMS review.
- **Deployment:** Railway backend with Postgres, Netlify frontend, Cloudinary for generated image hosting.

## Key Engineering Decisions

- **Human approval before publish:** Avoids the main business risk of autonomous AI posting incorrect or off-brand content.
- **Thin service boundaries:** Keeps integrations isolated in `services/` so Graph, Twilio, Cloudinary, and push logic can be tested or replaced independently.
- **Post lifecycle state:** Uses explicit statuses (`pending`, `approved`, `published`, `rejected`, `failed`) to make retries, history, and debugging straightforward.
- **Idempotent approval path:** Repeated approval taps do not double-publish an already resolved post.
- **Few-shot voice examples:** Gives the model user-specific context without training or maintaining a custom model.
- **Generated images only where useful:** Branded graphics are rendered for recurring educational post types; simpler posts stay text-only.
- **Operational metrics:** The dashboard now exposes publish count, approval rate, average time to publish, and failure rate from existing production data.
- **Draft quality evaluation:** Each draft receives rule-based checks for length, CTA strength, repetition risk, and voice fit before the owner approves it.

## Tradeoffs

- **Postgres over a queue service:** Simpler and sufficient for low-volume scheduled work, but a queue would be better for high-volume retries or parallel publishing.
- **Cron inside the app process:** Fast to ship on Railway, but an external scheduler would be more resilient at larger scale.
- **Prompting over retrieval:** Saved voice examples are enough for brand tone today; a retrieval layer would help if the content corpus grows or needs source-grounded knowledge.
- **Single-admin auth:** Appropriate for a solo-owner tool; role-based access would be needed for teams.
- **Minimal analytics:** Current metrics are useful for an MVP demo; product analytics events would be the next step for measuring behavior across users.

## Production-Readiness Details

- JWT-protected dashboard APIs.
- Short-lived scoped action tokens for one-tap notification approval/rejection.
- Token health checks for Facebook credentials.
- Push subscription pruning when browser endpoints expire.
- Managed deployment split between backend, database, frontend, and media hosting.
- Explicit failure states and error messages for publish failures.
- Transparent AI quality checks before publication.

## Pearson-Relevant Framing

- **Production AI, not a prototype:** The system drafts content, routes it through review, persists state, renders assets, and publishes through real third-party APIs.
- **End-to-end ownership:** The project spans product discovery, UX, prompt design, API design, scheduling, deployment, integrations, and operations.
- **Customer value:** It reduces recurring manual content work while preserving human editorial control.
- **Engineering judgment:** The design favors a small, reliable workflow with clear boundaries, controlled risk, and room to evolve.
- **Rapid delivery mindset:** The MVP focuses on the shortest path to a usable production workflow, then adds iteration points such as topic steering, voice examples, history, health checks, and metrics.

## Demo Path

1. Open the dashboard and show pending drafts plus production metrics.
2. Generate a draft with a specific topic to show controllable AI output.
3. Show the Draft Quality panel and explain that AI output is evaluated before approval.
4. Edit the post inline to demonstrate human-in-the-loop review and refreshed quality scoring.
5. Show the generated image preview for Tech Tip Tuesday or Wait What Wednesday.
6. Explain approve/reject behavior and why approval is idempotent.
7. Show Settings for schedule, voice examples, push notifications, and integration health.
8. Show History as the audit trail of published, rejected, and failed posts.

## Strong Interview Talking Points

- "I treated the LLM as one component in a production workflow, not as the whole product."
- "The core product decision was keeping a human approval gate because the cost of one bad public post is higher than the cost of one tap."
- "I used saved voice examples as lightweight personalization because it was faster and more maintainable than model fine-tuning for this use case."
- "The publish path is intentionally idempotent so repeated notification taps cannot accidentally create duplicate posts."
- "I started with transparent rule-based evaluation because it is explainable, cheap to run, and gives the owner useful review signals before adding heavier model-based evaluation."

## Next Improvements

- Add model-output evaluation scores before a draft enters the approval queue.
- Add structured telemetry events for generated, edited, approved, rejected, failed, and published states.
- Add integration tests around post generation, approval idempotency, and failed publish handling.
- Add role-based access if the product expands beyond one owner.
- Replace in-process cron with a managed scheduler or queue if volume or reliability needs increase.
