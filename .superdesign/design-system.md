# AR Educational Center CRM Design System

## Product context

AR Educational Center CRM is an operations product for owners and staff who
manage students, guardians, tutors, packages, enrollments, schedules, payments,
communications, and team access. The AI assistant is the signed-in home and
primary workflow; manual pages remain recovery and detail surfaces.

The assistant must feel trustworthy, fast, calm, and operational. It should
make multi-step work legible without looking like a developer console.

## Brand and visual identity

- Preserve the existing indigo-purple brand. Primary:
  `oklch(0.457 0.24 277.023)`.
- Use white and near-white as primary surfaces, near-black for body copy, and
  neutral gray for secondary information.
- Use purple as a focused signal: primary actions, assistant identity, selected
  thread, active progress, and high-value links. Do not wash large surfaces in
  purple.
- Destructive red is reserved for errors and irreversible actions.
- Success uses restrained emerald accents compatible with the existing chart
  palette.
- No gradients, neon effects, glassmorphism, decorative serif fonts, or
  consumer-chat novelty.

## Typography

- Use only the application sans stack: `"Avenir Next", "Segoe UI",
  "Helvetica Neue", Helvetica, Arial, sans-serif`.
- Conversation body: 15–16px, 1.65–1.75 line height, maximum readable width
  about 720px.
- Titles: compact and medium/semibold, not oversized.
- Metadata and tool status: 11–13px with adequate contrast.
- Render assistant Markdown semantically: paragraphs, emphasis, headings,
  lists, code, and links. Never display Markdown punctuation.

## Shape, spacing, and elevation

- Base radius is 10px. Use 12–16px for conversation cards and composer, pill
  radii only for status chips.
- Favor 4/8/12/16/24/32px spacing.
- Use borders/rings for hierarchy before shadows. Shadows remain small and
  functional, primarily for the sticky composer.
- Maintain generous space between turns but compact spacing inside a single
  assistant response.

## Assistant-page structure

- The page lives inside the existing CRM sidebar/top-bar shell.
- Desktop: compact thread rail plus a generous conversation workspace.
- Mobile/tablet: thread rail becomes a sheet; conversation and composer use the
  full width.
- Header clearly shows conversation title and model/status without spending a
  large vertical band.
- Tool activity groups with the user request that caused it, but completed read
  tools should collapse into a quiet activity summary instead of dominating the
  answer.
- Assistant responses are visually distinct through identity and alignment,
  not a heavy speech bubble.
- User messages use a compact tinted/primary bubble.
- Confirmation cards remain impossible to miss and show a human-readable action
  summary before Approve/Cancel.
- The composer is sticky, supports multiline text and attachments, clearly
  communicates Enter/Shift+Enter behavior, and keeps the send action prominent.

## States

- Empty: show a focused welcome, four task-oriented starter prompts, and a
  clear explanation that sensitive writes require confirmation.
- Streaming: preserve final typography while text arrives; use a subtle cursor
  and a concise activity label.
- Tool running: show namespace/action in a compact timeline row with spinner.
- Tool completed: use a check and concise result/link; collapse noisy raw data.
- Tool failed: show plain-language error and recovery action.
- Confirmation: elevated border/surface with action summary, affected record,
  expiry context, and balanced Cancel/Approve controls.
- Attachment: visible file chip before send and on the user turn after send.
- Configuration error: inline alert with Dashboard fallback; page shell remains
  usable.

## Motion and interaction

- 150–200ms color, opacity, and transform transitions.
- Avoid large layout motion while streaming.
- Automatically keep the newest turn in view, but never hijack scroll when the
  user is reviewing older content.
- Every icon-only control requires an accessible label and visible focus state.

## Hard constraints

- Use existing Shadcn primitives, Lucide icons, Tailwind utilities, and current
  tokens only.
- No new UI component library.
- Preserve all current capabilities: thread selection/archive/new, streaming,
  tools, deterministic confirmations, error recovery, deep links, attachments,
  and responsive behavior.
- The experience must meet WCAG AA contrast and keyboard-operability basics.
