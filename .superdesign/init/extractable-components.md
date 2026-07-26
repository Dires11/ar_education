# Extractable Components

## AppSidebar

- Source: `components/app-sidebar.tsx`
- Category: layout
- Description: Persistent product identity and primary CRM navigation.
- Extractable props: `activeItem` (string, default `"assistant"`).
- Hardcoded: AR logo tile, navigation labels, Lucide icon identities, CSS classes.

## ProtectedAppShell

- Source: `app/(protected)/layout.tsx`
- Category: layout
- Description: Sidebar, compact top bar, user control, and main content inset.
- Extractable props: none; content is provided through the default slot.
- Hardcoded: shell proportions, sidebar trigger, user-control placement.

## PageHero

- Source: `components/page-hero.tsx`
- Category: layout
- Description: Reusable title, description, metadata, and page-action header.
- Extractable props: `title`, `description`, `actions`, `meta`.
- Hardcoded: spacing, typography, surface treatment.

## Button

- Source: `components/ui/button.tsx`
- Category: basic
- Description: Shared action control.
- Extractable props: `variant`, `size`, `disabled`.
- Hardcoded: component states and Tailwind styles.

## Card

- Source: `components/ui/card.tsx`
- Category: basic
- Description: Shared rounded content surface.
- Extractable props: `size`.
- Hardcoded: ring, spacing, radius, and region styles.

## Badge

- Source: `components/ui/badge.tsx`
- Category: basic
- Description: Compact status and category label.
- Extractable props: `variant`.
- Hardcoded: pill shape, typography, and colors.

## AssistantThreadList

- Source: `app/(protected)/assistant/assistant-shell.tsx`
- Category: layout
- Description: Conversation navigation with selected and archive states.
- Extractable props: `selectedId`, `threadCount`.
- Hardcoded: date format, archive icon, compact row treatment.

## AssistantToolCard

- Source: `app/(protected)/assistant/assistant-shell.tsx`
- Category: basic
- Description: Tool progress, result, and deterministic confirmation surface.
- Extractable props: `status`, `requiresConfirmation`, `hasRecordLink`.
- Hardcoded: tool and status icons, approval/cancel actions.
