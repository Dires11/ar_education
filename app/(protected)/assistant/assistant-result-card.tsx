"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";
import {
  BanknoteIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CircleGaugeIcon,
  Clock3Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  MailIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import {
  GuardianAvatar,
  StudentAvatar,
  TutorAvatar,
} from "@/components/entity-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  normalizeAssistantResultCard,
  type AssistantResultCard,
} from "@/lib/validators/assistant";

type FieldIcon = AssistantResultCard["fields"][number]["icon"];

const FIELD_ICONS: Record<FieldIcon, ComponentType<{ className?: string }>> = {
  BOOK: BookOpenIcon,
  CALENDAR: CalendarDaysIcon,
  CLOCK: Clock3Icon,
  GRADUATION: GraduationCapIcon,
  GUARDIAN: HeartHandshakeIcon,
  LOCATION: MapPinIcon,
  MAIL: MailIcon,
  MONEY: BanknoteIcon,
  PACKAGE: PackageIcon,
  PAYMENT: CreditCardIcon,
  PHONE: PhoneIcon,
  STATUS: CircleGaugeIcon,
  USER: UserRoundIcon,
};

const BADGE_STYLES: Record<
  AssistantResultCard["badges"][number]["tone"],
  string
> = {
  SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NEUTRAL: "bg-background/80 text-foreground",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800",
  DESTRUCTIVE: "border-red-200 bg-red-50 text-red-700",
};

export function parseAssistantResultCard(
  value: unknown,
): AssistantResultCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const card = Reflect.get(value, "card");
  return parseAssistantResultCardValue(card);
}

export function parseAssistantResultCardValue(
  value: unknown,
): AssistantResultCard | null {
  return normalizeAssistantResultCard(value);
}

function ResultAvatar({ card }: { card: AssistantResultCard }) {
  if (!card.avatar) {
    const Icon =
      card.kind === "PACKAGE"
        ? PackageIcon
        : card.kind === "ENROLLMENT"
          ? BookOpenIcon
          : card.kind === "SESSION"
            ? CalendarDaysIcon
            : card.kind === "PAYMENT"
              ? CreditCardIcon
              : card.kind === "SUBJECT"
                ? GraduationCapIcon
                : card.kind === "GROUP"
                  ? UsersIcon
                  : card.kind === "EMAIL"
                    ? MailIcon
                    : card.kind === "TEAM"
                      ? HeartHandshakeIcon
                      : UserRoundIcon;
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
    );
  }

  const props = {
    firstName: card.avatar.firstName,
    lastName: card.avatar.lastName,
    avatarUrl: card.avatar.avatarUrl,
    size: "lg" as const,
    className: "h-10 w-10 shrink-0 rounded-2xl",
  };

  if (card.avatar.kind === "GUARDIAN") return <GuardianAvatar {...props} />;
  if (card.avatar.kind === "TUTOR") return <TutorAvatar {...props} />;
  return <StudentAvatar {...props} />;
}

export function AssistantEntityCard({
  card,
  showSuggestions = false,
  disabled = false,
  onPrompt,
}: {
  card: AssistantResultCard;
  showSuggestions?: boolean;
  disabled?: boolean;
  onPrompt?: (prompt: string) => void;
}) {
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-gradient-to-br from-amber-50 via-background to-emerald-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <ResultAvatar card={card} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {card.title}
            </h3>
            {card.subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {card.subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {card.badges.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.badges.map((badge) => (
              <Badge
                key={`${badge.label}-${badge.tone}`}
                variant="outline"
                className={cn(
                  "rounded-full font-normal",
                  BADGE_STYLES[badge.tone],
                )}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        {card.fields.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {card.fields.map((field) => {
              const Icon = FIELD_ICONS[field.icon];
              return (
                <div
                  key={`${field.label}-${field.value}`}
                  className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm"
                >
                  <dt className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {field.label}
                  </dt>
                  <dd className="mt-1.5 truncate text-sm font-medium">
                    {field.value}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        <Button variant="outline" className="w-full rounded-xl" asChild>
          <Link href={card.href}>
            {card.actionLabel}
            <ExternalLinkIcon className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {showSuggestions &&
      !suggestionsDismissed &&
      card.suggestedActions.length > 0 ? (
        <div className="border-t bg-muted/20 px-3 py-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
            What would you like to do next?
          </p>
          <div className="flex flex-wrap gap-2">
            {card.suggestedActions.map((action) => (
              <Button
                key={`${action.kind}-${action.label}`}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full bg-background"
                disabled={disabled}
                onClick={() => {
                  if (action.kind === "DISMISS") {
                    setSuggestionsDismissed(true);
                    return;
                  }
                  onPrompt?.(action.prompt);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function AssistantResultCards({
  results,
  disabled,
  onPrompt,
}: {
  results: unknown[];
  disabled: boolean;
  onPrompt: (prompt: string) => void;
}) {
  const cards = useMemo(() => {
    const byEntity = new Map<string, AssistantResultCard>();
    for (const result of results) {
      const card = parseAssistantResultCard(result);
      if (!card) continue;
      byEntity.delete(card.entityKey);
      byEntity.set(card.entityKey, card);
    }
    return [...byEntity.values()];
  }, [results]);

  if (cards.length === 0) return null;

  return (
    <div className="grid gap-3">
      {cards.map((card, index) => (
        <AssistantEntityCard
          key={card.entityKey}
          card={card}
          showSuggestions={index === cards.length - 1}
          disabled={disabled}
          onPrompt={onPrompt}
        />
      ))}
    </div>
  );
}
