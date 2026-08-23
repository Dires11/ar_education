"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Archive,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { archiveAssistantThreadAction } from "@/app/actions/assistant";
import { AssistantMarkdown } from "./assistant-markdown";
import {
  consumeAssistantEventStream,
  getToolCompletionStatus,
  isAssistantOutcomeUnknown,
  isVisibleConfirmationArgument,
  redactAssistantIdentifiers,
  type AssistantClientToolStatus,
} from "./assistant-stream-client";
import {
  AssistantEntityCard,
  AssistantResultCards,
  parseAssistantResultCardValue,
} from "./assistant-result-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_ATTACHMENT_MIME_TYPES,
  MAX_ASSISTANT_ATTACHMENTS,
  MAX_ASSISTANT_ATTACHMENT_BYTES,
  MAX_ASSISTANT_TOTAL_ATTACHMENT_BYTES,
  type AssistantAttachmentMetadata,
} from "@/lib/validators/assistant";

type ThreadListItem = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type ToolStatus =
  | "PENDING_CONFIRMATION"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN"
  | "REJECTED"
  | "EXPIRED";

type ToolItem = {
  id: string;
  namespace: string;
  toolName: string;
  preview: unknown;
  result: unknown;
  status: ToolStatus;
  requiresConfirmation: boolean;
  expiresAt: string | null;
  error: string | null;
};

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  attachments: AssistantAttachmentMetadata[];
  tools: ToolItem[];
  failure: {
    clientTurnId: string;
    error: string;
    hasAttachments: boolean;
    outcomeUnknown: boolean;
    retryable: boolean;
  } | null;
};

type PendingAttachment = Omit<AssistantAttachmentMetadata, "kind"> & {
  dataBase64: string;
};

type FailedTurn = {
  clientTurnId: string;
  optimisticId: string;
  content: string;
  attachments: PendingAttachment[];
  error: string;
  outcomeUnknown: boolean;
  requiresReattachment: boolean;
  retryable: boolean;
  editing: boolean;
};

type SelectedThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
};

type ConversationTurn = {
  id: string;
  user: ChatMessage | null;
  assistant: ChatMessage | null;
  tools: ToolItem[];
};

type StreamEvent =
  | {
      type: "thread_created";
      threadId: string;
      title: string;
      messageCount: number;
    }
  | { type: "assistant_delta"; delta: string }
  | {
      type: "tool_started";
      toolRunId: string;
      namespace: string;
      toolName: string;
    }
  | {
      type: "tool_completed";
      toolRunId: string;
      namespace: string;
      toolName: string;
      result: unknown;
    }
  | {
      type: "confirmation_required";
      toolRunId: string;
      namespace: string;
      toolName: string;
      preview: unknown;
      expiresAt: string;
    }
  | {
      type: "assistant_completed";
      runId: string;
      threadId: string;
      messageId: string;
      content: string;
      messageCount: number;
    }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "Create a new student and add their guardian",
  "What sessions are scheduled this month?",
  "Show me overdue payments",
  "Create a tutor and assign subjects",
];

const ATTACHMENT_ACCEPT = [
  ...ASSISTANT_ATTACHMENT_MIME_TYPES,
  ".pdf",
  ".doc",
  ".docx",
  ".rtf",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
].join(",");

const MIME_BY_EXTENSION: Record<string, PendingAttachment["mimeType"]> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentMimeType(file: File) {
  if (
    ASSISTANT_ATTACHMENT_MIME_TYPES.includes(
      file.type as (typeof ASSISTANT_ATTACHMENT_MIME_TYPES)[number],
    )
  ) {
    return file.type as PendingAttachment["mimeType"];
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error(`Unable to encode ${file.name}`));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function compressLargeCalendarImage(file: File) {
  if (
    file.size <= 2.4 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.86, 0.76, 0.66]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= 2.4 * 1024 * 1024) {
      const name = file.name.replace(/\.[^.]+$/, "") || "calendar";
      return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
    }
  }
  return file;
}

function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: AssistantAttachmentMetadata[];
  onRemove?: (index: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex max-w-full flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <span
          key={`${attachment.name}-${index}`}
          className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-background/80 px-2.5 py-2 text-xs text-foreground"
        >
          {attachment.kind === "IMAGE" ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span className="block max-w-52 truncate font-medium">
              {attachment.name}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {formatFileSize(attachment.sizeBytes)}
            </span>
          </span>
          {onRemove ? (
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function formatThreadDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildConversationTurns(messages: ChatMessage[]) {
  const turns: ConversationTurn[] = [];

  for (const message of messages) {
    if (message.role === "USER") {
      turns.push({
        id: message.id,
        user: message,
        assistant: null,
        tools: message.tools,
      });
      continue;
    }

    const current = turns.at(-1);
    if (current && !current.assistant) {
      current.assistant = message;
      continue;
    }

    turns.push({
      id: message.id,
      user: null,
      assistant: message,
      tools: [],
    });
  }

  return turns;
}

function persistedFailedTurn(messages: ChatMessage[]): FailedTurn | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "USER" || !message.failure) continue;
    return {
      clientTurnId: message.failure.clientTurnId,
      optimisticId: message.id,
      content: message.content,
      attachments: [],
      error: message.failure.error,
      outcomeUnknown: message.failure.outcomeUnknown,
      requiresReattachment:
        message.failure.retryable && message.failure.hasAttachments,
      retryable: message.failure.retryable,
      editing: false,
    };
  }
  return null;
}

function resultHref(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "href" in result &&
    typeof result.href === "string"
  ) {
    return result.href;
  }
  return null;
}

function displayToolName(toolName: string) {
  return toolName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ThreadList({
  threads,
  selectedId,
  onSelect,
  onArchive,
  archiveDisabledId,
  archiving,
}: {
  threads: ThreadListItem[];
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  archiveDisabledId: string | null;
  archiving: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {threads.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <MessageSquare className="mx-auto mb-3 h-5 w-5 text-muted-foreground/60" />
          <p className="text-sm font-medium">No threads yet</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Start with a request and it will appear here.
          </p>
        </div>
      ) : (
        threads.map((thread) => (
          <div
            key={thread.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg border border-transparent transition-colors",
              selectedId === thread.id
                ? "border-primary/10 bg-primary/7 text-accent-foreground"
                : "hover:border-border/70 hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => onSelect(thread.id)}
            >
              <span className="block truncate text-sm font-medium">
                {thread.title}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{formatThreadDate(thread.updatedAt)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {thread.messageCount}{" "}
                  {thread.messageCount === 1 ? "message" : "messages"}
                </span>
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mr-1 opacity-60 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
              aria-label={`Archive ${thread.title}`}
              disabled={archiving || archiveDisabledId === thread.id}
              onClick={() => onArchive(thread.id)}
            >
              <Archive />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? "None"
      : value.map((item) => formatPreviewValue(item)).join(", ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${humanizeKey(key)}: ${formatPreviewValue(item)}`)
      .join(" · ");
  }
  return String(value);
}

function confirmationContent(tool: ToolItem) {
  const preview = isRecord(tool.preview) ? tool.preview : {};
  const argumentsValue = isRecord(preview.arguments)
    ? redactAssistantIdentifiers(preview.arguments)
    : {};
  const hasAttendancePreview =
    isRecord(argumentsValue) && Array.isArray(argumentsValue.attendancePreview);
  const card = parseAssistantResultCardValue(preview.card);

  return {
    title:
      typeof preview.title === "string"
        ? preview.title
        : displayToolName(tool.toolName),
    warning:
      typeof preview.warning === "string"
        ? preview.warning
        : "This action will change CRM data after approval.",
    card,
    details: Object.entries(isRecord(argumentsValue) ? argumentsValue : {})
      .filter(
        ([key]) =>
          isVisibleConfirmationArgument(key) &&
          !(key === "attendances" && hasAttendancePreview),
      )
      .map(([key, value]) => ({
        label: humanizeKey(key),
        value: formatPreviewValue(value),
      })),
  };
}

function ToolStatusIcon({ status }: { status: ToolStatus }) {
  if (status === "RUNNING") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  }
  if (status === "COMPLETED") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (
    status === "FAILED" ||
    status === "UNKNOWN" ||
    status === "REJECTED" ||
    status === "EXPIRED"
  ) {
    return <CircleAlert className="h-3.5 w-3.5 text-destructive" />;
  }
  return <Wrench className="h-3.5 w-3.5 text-primary" />;
}

function toolStatusLabel(status: ToolStatus) {
  if (status === "RUNNING") return "In progress";
  if (status === "COMPLETED") return "Completed";
  if (status === "PENDING_CONFIRMATION") return "Waiting for approval";
  if (status === "UNKNOWN") return "Outcome unknown";
  return humanizeKey(status.toLowerCase());
}

function ConfirmationCard({
  tool,
  busy,
  now,
  onDecision,
}: {
  tool: ToolItem;
  busy: boolean;
  now: number;
  onDecision: (toolRunId: string, decision: "APPROVE" | "REJECT") => void;
}) {
  const content = confirmationContent(tool);
  const expired = Boolean(
    tool.expiresAt && new Date(tool.expiresAt).getTime() <= now,
  );

  return (
    <div className="overflow-hidden rounded-xl border-2 border-primary/20 bg-primary/[0.045]">
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{content.title}</h3>
              <Badge
                variant="outline"
                className="border-primary/20 bg-background/70 text-[10px] uppercase tracking-wider text-primary"
              >
                Approval required
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {content.warning}
            </p>
          </div>
        </div>

        {content.card ? <AssistantEntityCard card={content.card} /> : null}

        {content.details.length > 0 ? (
          <dl className="grid gap-x-5 gap-y-2 rounded-lg border bg-background/70 p-3 text-xs sm:grid-cols-[minmax(7rem,auto)_1fr]">
            {content.details.map((detail) => (
              <div
                key={detail.label}
                className="grid gap-0.5 sm:col-span-2 sm:grid-cols-subgrid"
              >
                <dt className="font-medium text-muted-foreground">
                  {detail.label}
                </dt>
                <dd className="break-words text-foreground">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {expired
              ? "This approval has expired. Ask the assistant to prepare it again."
              : tool.expiresAt
                ? `Approval expires ${new Date(tool.expiresAt).toLocaleString()}`
                : "Review the details before continuing."}
          </p>
          {expired ? (
            <Badge
              variant="outline"
              className="border-destructive/20 text-destructive"
            >
              Expired
            </Badge>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onDecision(tool.id, "REJECT")}
              >
                Discard action
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => onDecision(tool.id, "APPROVE")}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve & execute
              </Button>
            </div>
          )}
        </div>
        {tool.error ? (
          <p className="text-xs text-destructive">{tool.error}</p>
        ) : null}
      </div>
    </div>
  );
}

function ToolActivity({
  tools,
  busyToolId,
  now,
  onDecision,
}: {
  tools: ToolItem[];
  busyToolId: string | null;
  now: number;
  onDecision: (toolRunId: string, decision: "APPROVE" | "REJECT") => void;
}) {
  const confirmations = tools.filter(
    (tool) => tool.status === "PENDING_CONFIRMATION",
  );
  const activity = tools.filter(
    (tool) => tool.status !== "PENDING_CONFIRMATION",
  );
  const hasActive = activity.some((tool) => tool.status === "RUNNING");
  const hasProblem = activity.some(
    (tool) =>
      tool.status === "FAILED" ||
      tool.status === "UNKNOWN" ||
      tool.status === "REJECTED" ||
      tool.status === "EXPIRED",
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const completedCount = activity.filter(
    (tool) => tool.status === "COMPLETED",
  ).length;
  const activityLabel = hasActive
    ? `Running ${activity.length} operational ${
        activity.length === 1 ? "tool" : "tools"
      }`
    : hasProblem
      ? `${activity.length} operational ${
          activity.length === 1 ? "step" : "steps"
        } · attention needed`
      : `${completedCount} operational ${
          completedCount === 1 ? "step" : "steps"
        } completed`;

  if (tools.length === 0) return null;

  return (
    <div className="space-y-3">
      {activity.length > 0 ? (
        <details
          className="group overflow-hidden rounded-lg border bg-muted/25"
          open={activityOpen}
          onToggle={(event) => setActivityOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              {hasActive ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              ) : hasProblem ? (
                <CircleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <Wrench className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <span className="truncate">{activityLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t px-3 py-2.5">
            {activity.map((tool) => {
              const href = resultHref(tool.result);
              return (
                <div key={tool.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5">
                    <ToolStatusIcon status={tool.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-foreground">
                        {displayToolName(tool.toolName)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {toolStatusLabel(tool.status)}
                      </span>
                    </div>
                    {tool.error ? (
                      <p className="mt-1 leading-5 text-destructive">
                        {tool.error}
                      </p>
                    ) : null}
                    {href && tool.status === "COMPLETED" ? (
                      <Link
                        href={href}
                        className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Open affected record
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {confirmations.map((tool) => (
        <ConfirmationCard
          key={tool.id}
          tool={tool}
          busy={busyToolId === tool.id}
          now={now}
          onDecision={onDecision}
        />
      ))}
    </div>
  );
}

export function AssistantShell({
  configured,
  initialThreads,
  initialThread,
}: {
  configured: boolean;
  initialThreads: ThreadListItem[];
  initialThread: SelectedThread | null;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [threadId, setThreadId] = useState(initialThread?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialThread?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [busy, setBusy] = useState(false);
  const [decisionToolId, setDecisionToolId] = useState<string | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(() =>
    persistedFailedTurn(initialThread?.messages ?? []),
  );
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [threadRailOpen, setThreadRailOpen] = useState(true);
  const [confirmationNow, setConfirmationNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [isArchiving, startArchiving] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    setThreadId(initialThread?.id ?? null);
    setMessages(initialThread?.messages ?? []);
    setAttachments([]);
    setStreamingText("");
    setFailedTurn(persistedFailedTurn(initialThread?.messages ?? []));
    stickToBottomRef.current = true;
  }, [initialThread]);

  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  useEffect(() => {
    const now = Date.now();
    const nextExpiry = messages
      .flatMap((message) => message.tools)
      .filter(
        (tool) =>
          tool.status === "PENDING_CONFIRMATION" &&
          tool.expiresAt &&
          new Date(tool.expiresAt).getTime() > now,
      )
      .map((tool) => new Date(tool.expiresAt!).getTime())
      .sort((left, right) => left - right)[0];
    if (!nextExpiry) return;
    const timeout = window.setTimeout(
      () => setConfirmationNow(Date.now()),
      nextExpiry - now + 50,
    );
    return () => window.clearTimeout(timeout);
  }, [confirmationNow, messages]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    endRef.current?.scrollIntoView({
      behavior: streamingText ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, streamingText]);

  const pendingConfirmation = useMemo(
    () =>
      messages.some((message) =>
        message.tools.some(
          (tool) =>
            tool.status === "PENDING_CONFIRMATION" &&
            (!tool.expiresAt ||
              new Date(tool.expiresAt).getTime() > confirmationNow),
        ),
      ),
    [confirmationNow, messages],
  );
  const conversationTurns = useMemo(
    () => buildConversationTurns(messages),
    [messages],
  );
  const currentTitle = threadId
    ? (threads.find((thread) => thread.id === threadId)?.title ?? "Assistant")
    : "AI Assistant";

  function selectThread(id: string) {
    if (busy) return;
    setThreadSheetOpen(false);
    router.push(`/assistant?thread=${encodeURIComponent(id)}`);
  }

  function newConversation() {
    if (busy) return;
    setThreadSheetOpen(false);
    setThreadId(null);
    setMessages([]);
    setStreamingText("");
    setInput("");
    setAttachments([]);
    setFailedTurn(null);
    stickToBottomRef.current = true;
    router.push("/assistant?new=1");
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0 || busy || pendingConfirmation) return;
    if (attachments.length + selected.length > MAX_ASSISTANT_ATTACHMENTS) {
      toast.error(`You can attach up to ${MAX_ASSISTANT_ATTACHMENTS} files.`);
      return;
    }

    setPreparingAttachments(true);
    try {
      const prepared: PendingAttachment[] = [];
      for (const originalFile of selected) {
        const originalMime = attachmentMimeType(originalFile);
        if (!originalMime) {
          throw new Error(`${originalFile.name} is not a supported file type.`);
        }
        const file = originalMime.startsWith("image/")
          ? await compressLargeCalendarImage(originalFile)
          : originalFile;
        const mimeType = attachmentMimeType(file);
        if (!mimeType) {
          throw new Error(`${file.name} is not a supported file type.`);
        }
        if (file.size > MAX_ASSISTANT_ATTACHMENT_BYTES) {
          throw new Error(
            `${file.name} is too large. Each attachment must be 3 MB or less.`,
          );
        }
        prepared.push({
          name: file.name,
          mimeType,
          sizeBytes: file.size,
          dataBase64: await readFileAsBase64(file),
        });
      }
      const totalBytes = [...attachments, ...prepared].reduce(
        (total, attachment) => total + attachment.sizeBytes,
        0,
      );
      if (totalBytes > MAX_ASSISTANT_TOTAL_ATTACHMENT_BYTES) {
        throw new Error("Attachments must be 3 MB or less in total.");
      }
      setAttachments((current) => [...current, ...prepared]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to attach file",
      );
    } finally {
      setPreparingAttachments(false);
    }
  }

  function updateTool(toolRunId: string, update: Partial<ToolItem>) {
    setMessages((current) => {
      const next = [...current];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index].role !== "USER") continue;
        const message = next[index];
        const toolIndex = message.tools.findIndex(
          (tool) => tool.id === toolRunId,
        );
        const tools = [...message.tools];
        if (toolIndex >= 0) {
          tools[toolIndex] = { ...tools[toolIndex], ...update };
        } else {
          tools.push({
            id: toolRunId,
            namespace: String(update.namespace ?? ""),
            toolName: String(update.toolName ?? ""),
            preview: update.preview ?? null,
            result: update.result ?? null,
            status: update.status ?? "RUNNING",
            requiresConfirmation: update.requiresConfirmation ?? false,
            expiresAt: update.expiresAt ?? null,
            error: update.error ?? null,
          });
        }
        next[index] = { ...message, tools };
        break;
      }
      return next;
    });
  }

  function handleStreamEvent(event: StreamEvent) {
    switch (event.type) {
      case "thread_created": {
        setThreadId(event.threadId);
        setThreads((current) => {
          const existing = current.find(
            (thread) => thread.id === event.threadId,
          );
          if (existing) {
            return [
              {
                ...existing,
                updatedAt: new Date().toISOString(),
                messageCount: event.messageCount,
              },
              ...current.filter((thread) => thread.id !== event.threadId),
            ];
          }
          return [
            {
              id: event.threadId,
              title: event.title,
              updatedAt: new Date().toISOString(),
              messageCount: event.messageCount,
            },
            ...current,
          ];
        });
        window.history.replaceState(
          null,
          "",
          `/assistant?thread=${encodeURIComponent(event.threadId)}`,
        );
        break;
      }
      case "assistant_delta":
        setStreamingText((current) => current + event.delta);
        break;
      case "tool_started":
        updateTool(event.toolRunId, {
          namespace: event.namespace,
          toolName: event.toolName,
          status: "RUNNING",
        });
        break;
      case "tool_completed":
        updateTool(event.toolRunId, {
          namespace: event.namespace,
          toolName: event.toolName,
          status: getToolCompletionStatus(event.result),
          result: event.result,
        });
        break;
      case "confirmation_required":
        updateTool(event.toolRunId, {
          namespace: event.namespace,
          toolName: event.toolName,
          status: "PENDING_CONFIRMATION",
          preview: event.preview,
          requiresConfirmation: true,
          expiresAt: event.expiresAt,
        });
        setConfirmationNow(Date.now());
        setAnnouncement("An action is ready for your approval.");
        break;
      case "assistant_completed":
        setMessages((current) => [
          ...current.filter((message) => message.id !== event.messageId),
          {
            id: event.messageId,
            role: "ASSISTANT",
            content: event.content,
            createdAt: new Date().toISOString(),
            attachments: [],
            tools: [],
            failure: null,
          },
        ]);
        setThreads((current) =>
          current.map((thread) =>
            thread.id === event.threadId
              ? {
                  ...thread,
                  messageCount: event.messageCount,
                  updatedAt: new Date().toISOString(),
                }
              : thread,
          ),
        );
        setStreamingText("");
        setFailedTurn(null);
        setAnnouncement("Assistant response complete.");
        break;
      case "error":
        throw new Error(event.message);
    }
  }

  async function sendMessage(message: string, retry?: FailedTurn) {
    const outgoingAttachments = retry?.attachments ?? attachments;
    if (retry?.requiresReattachment && outgoingAttachments.length === 0) {
      toast.error("Attach the original files again before retrying.");
      return;
    }
    if (
      (!message.trim() && outgoingAttachments.length === 0) ||
      busy ||
      preparingAttachments ||
      pendingConfirmation ||
      !configured
    ) {
      return;
    }
    const content = retry?.content ?? message.trim();
    const attachmentMetadata: AssistantAttachmentMetadata[] =
      outgoingAttachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        kind: attachment.mimeType.startsWith("image/") ? "IMAGE" : "DOCUMENT",
      }));
    const optimisticId = retry?.optimisticId ?? `local-${crypto.randomUUID()}`;
    const clientTurnId = retry?.clientTurnId ?? crypto.randomUUID();
    if (!retry || retry.editing) {
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticId),
        {
          id: optimisticId,
          role: "USER",
          content,
          createdAt: new Date().toISOString(),
          attachments: attachmentMetadata,
          tools: [],
          failure: null,
        },
      ]);
    }
    setInput("");
    setAttachments([]);
    setStreamingText("");
    setFailedTurn(null);
    setAnnouncement("Assistant is responding.");
    stickToBottomRef.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/assistant/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadId ?? undefined,
          clientTurnId,
          message: content,
          attachments: outgoingAttachments,
        }),
      });
      await consumeAssistantEventStream(response, handleStreamEvent);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Assistant request failed";
      const outcomeUnknown = isAssistantOutcomeUnknown(error);
      toast.error(message);
      setStreamingText("");
      setFailedTurn({
        clientTurnId,
        optimisticId,
        content,
        attachments: outgoingAttachments,
        error: message,
        outcomeUnknown,
        requiresReattachment: false,
        retryable: !outcomeUnknown,
        editing: false,
      });
      setAnnouncement(
        outcomeUnknown
          ? "Assistant request stopped with an uncertain outcome. Reload its status before continuing."
          : "Assistant request failed. A safe retry is available.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const retry = failedTurn?.editing
      ? {
          ...failedTurn,
          content: input.trim(),
          attachments,
        }
      : undefined;
    void sendMessage(input, retry);
  }

  async function decide(toolRunId: string, decision: "APPROVE" | "REJECT") {
    if (busy || decisionToolId) return;
    setDecisionToolId(toolRunId);
    setBusy(true);
    setStreamingText("");
    setAnnouncement(
      decision === "APPROVE"
        ? "Executing the approved action."
        : "Discarding the pending action.",
    );
    updateTool(toolRunId, {
      status: decision === "APPROVE" ? "RUNNING" : "REJECTED",
    });
    let resolvedStatus: AssistantClientToolStatus | null = null;
    try {
      const response = await fetch(
        `/api/assistant/tool-runs/${encodeURIComponent(toolRunId)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      await consumeAssistantEventStream(response, (event: StreamEvent) => {
        if (event.type === "tool_completed" && event.toolRunId === toolRunId) {
          resolvedStatus = getToolCompletionStatus(event.result);
        }
        handleStreamEvent(event);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to apply decision";
      toast.error(message);
      if (resolvedStatus) {
        updateTool(toolRunId, { status: resolvedStatus, error: message });
        setAnnouncement(
          resolvedStatus === "COMPLETED"
            ? "The action completed, but the assistant response stopped. Reload to review the recorded result before continuing."
            : resolvedStatus === "REJECTED"
              ? "The action was discarded, but the assistant response stopped."
              : resolvedStatus === "UNKNOWN"
                ? "The action's outcome is unknown. Reload and verify the affected record or delivery before continuing."
                : "The action failed before the assistant response completed.",
        );
      } else if (isAssistantOutcomeUnknown(error)) {
        updateTool(toolRunId, { status: "UNKNOWN", error: message });
        setAnnouncement(
          "The decision request stopped with an uncertain outcome. Reload to reconcile its recorded status before continuing.",
        );
      } else {
        const tool = messages
          .flatMap((item) => item.tools)
          .find((item) => item.id === toolRunId);
        const expired = Boolean(
          tool?.expiresAt && new Date(tool.expiresAt).getTime() <= Date.now(),
        );
        updateTool(toolRunId, {
          status: expired ? "EXPIRED" : "PENDING_CONFIRMATION",
          error: message,
        });
        setAnnouncement(
          expired
            ? "The approval expired."
            : "The decision was not confirmed. The approval controls remain available.",
        );
      }
    } finally {
      setBusy(false);
      setDecisionToolId(null);
    }
  }

  function archiveThread(id: string) {
    if (isArchiving || (threadId === id && (busy || pendingConfirmation))) {
      return;
    }
    startArchiving(async () => {
      try {
        await archiveAssistantThreadAction(id);
        const remaining = threads.filter((thread) => thread.id !== id);
        setThreads(remaining);
        if (threadId === id) {
          const next = remaining[0]?.id;
          setThreadId(null);
          setMessages([]);
          router.push(next ? `/assistant?thread=${next}` : "/assistant");
        }
        toast.success("Conversation archived");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to archive conversation",
        );
      }
    });
  }

  const threadList = (
    <ThreadList
      threads={threads}
      selectedId={threadId}
      onSelect={selectThread}
      onArchive={archiveThread}
      archiveDisabledId={
        threadId && (busy || pendingConfirmation) ? threadId : null
      }
      archiving={isArchiving}
    />
  );

  return (
    <div
      className={cn(
        "grid h-[calc(100dvh-5.5rem)] min-h-0 overflow-hidden rounded-xl border bg-background shadow-sm transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none",
        threadRailOpen
          ? "lg:grid-cols-[16rem_minmax(0,1fr)]"
          : "lg:grid-cols-[0rem_minmax(0,1fr)]",
      )}
    >
      <aside
        id="assistant-thread-rail"
        aria-hidden={!threadRailOpen}
        inert={!threadRailOpen}
        className={cn(
          "hidden min-h-0 min-w-0 overflow-hidden border-r bg-muted/15 transition-[border-color] duration-200 ease-out motion-reduce:transition-none lg:block",
          !threadRailOpen && "border-transparent",
        )}
      >
        <div
          className={cn(
            "flex h-full w-64 min-w-64 flex-col transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            threadRailOpen
              ? "translate-x-0 opacity-100"
              : "-translate-x-2 opacity-0",
          )}
        >
          <div className="border-b p-3">
            <div className="flex items-center gap-2">
              <Button
                className="min-w-0 flex-1 gap-2"
                onClick={newConversation}
              >
                <Plus /> New thread
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Close conversations"
                aria-controls="assistant-thread-rail"
                aria-expanded="true"
                title="Close conversations"
                onClick={() => setThreadRailOpen(false)}
              >
                <PanelLeftClose />
              </Button>
            </div>
          </div>
          {threadList}
        </div>
      </aside>

      <section className="relative flex min-h-0 min-w-0 flex-col bg-background">
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          {!threadRailOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              aria-label="Open conversations"
              aria-controls="assistant-thread-rail"
              aria-expanded="false"
              title="Open conversations"
              onClick={() => setThreadRailOpen(true)}
            >
              <PanelLeftOpen />
            </Button>
          ) : null}
          <Sheet open={threadSheetOpen} onOpenChange={setThreadSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden">
                <PanelLeft />
                <span className="sr-only">Open conversations</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[min(20rem,90vw)] flex-col p-0"
            >
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle>Assistant threads</SheetTitle>
                <SheetDescription>
                  Switch conversations or start a new request.
                </SheetDescription>
              </SheetHeader>
              <div className="p-3">
                <Button className="w-full" onClick={newConversation}>
                  <Plus /> New thread
                </Button>
              </div>
              {threadList}
            </SheetContent>
          </Sheet>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {currentTitle}
            </h1>
            <p className="text-[11px] text-muted-foreground">GPT-5.6 Luna</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {threadId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy || pendingConfirmation || isArchiving}
                onClick={() => archiveThread(threadId)}
                title="Archive current thread"
              >
                {isArchiving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Archive />
                )}
                <span className="sr-only">Archive current thread</span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={newConversation}
            >
              <Plus /> New thread
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="sm:hidden"
              onClick={newConversation}
            >
              <Plus />
              <span className="sr-only">New thread</span>
            </Button>
          </div>
        </header>

        {!configured ? (
          <div className="shrink-0 p-3 sm:px-6 sm:pt-4">
            <Alert variant="destructive">
              <Bot />
              <AlertTitle>Assistant configuration required</AlertTitle>
              <AlertDescription>
                Set the server-side <code>OPENAI_API_KEY</code> environment
                variable to enable Luna. The rest of the CRM remains available.
                <div className="mt-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard">Open Dashboard</Link>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div
          ref={scrollAreaRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={() => {
            const element = scrollAreaRef.current;
            if (!element) return;
            stickToBottomRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              120;
          }}
        >
          {messages.length === 0 && !streamingText ? (
            <div className="mx-auto flex min-h-full max-w-[48rem] flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
              <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/10 bg-primary/8 text-primary">
                <Sparkles className="h-6 w-6" />
              </span>
              <h2 className="text-balance text-2xl font-semibold tracking-tight">
                What would you like to get done?
              </h2>
              <p className="mt-2 max-w-xl text-balance text-sm leading-6 text-muted-foreground">
                Create students, manage tutors and packages, build schedules,
                review payments, or attach a calendar and turn it into sessions.
              </p>
              <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="group rounded-xl border bg-card p-4 text-left text-sm leading-5 transition-all hover:border-primary/20 hover:bg-primary/[0.035] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    disabled={!configured || busy}
                    onClick={() => void sendMessage(suggestion)}
                  >
                    <MessageSquare className="mb-3 h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[48rem] space-y-10 px-4 py-8 sm:px-6 sm:py-10">
              {conversationTurns.map((turn, index) => {
                const isLast = index === conversationTurns.length - 1;
                const showAssistant =
                  Boolean(turn.assistant) ||
                  turn.tools.length > 0 ||
                  (isLast && (busy || Boolean(streamingText)));

                return (
                  <section key={turn.id} className="space-y-5">
                    {turn.user ? (
                      <div className="group flex flex-col items-end gap-2">
                        {turn.user.content ? (
                          <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[15px] leading-6 text-primary-foreground shadow-sm sm:max-w-[82%]">
                            {turn.user.content}
                          </p>
                        ) : null}
                        {turn.user.attachments.length > 0 ? (
                          <div className="flex max-w-[88%] justify-end sm:max-w-[82%]">
                            <AttachmentChips
                              attachments={turn.user.attachments}
                            />
                          </div>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100">
                          {formatMessageTime(turn.user.createdAt)}
                        </span>
                      </div>
                    ) : null}

                    {turn.user && failedTurn?.optimisticId === turn.user.id ? (
                      <div
                        className="ml-auto max-w-[88%] rounded-xl border border-destructive/20 bg-destructive/5 p-3 sm:max-w-[82%]"
                        role="alert"
                      >
                        <p className="text-xs leading-5 text-destructive">
                          {failedTurn.error}
                        </p>
                        {failedTurn.requiresReattachment ? (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Attach the original files again below before
                            retrying. File contents are not retained after the
                            request ends.
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          {failedTurn.outcomeUnknown ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => router.refresh()}
                            >
                              Reload status
                            </Button>
                          ) : !failedTurn.retryable ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                const content = failedTurn.content;
                                newConversation();
                                setInput(content);
                              }}
                            >
                              Start a new request
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  busy ||
                                  (failedTurn.requiresReattachment &&
                                    attachments.length === 0)
                                }
                                onClick={() =>
                                  void sendMessage(
                                    failedTurn.content,
                                    failedTurn.requiresReattachment
                                      ? { ...failedTurn, attachments }
                                      : failedTurn,
                                  )
                                }
                              >
                                {failedTurn.requiresReattachment
                                  ? "Retry with attachments"
                                  : "Retry safely"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setInput(failedTurn.content);
                                  setAttachments(failedTurn.attachments);
                                  setMessages((current) =>
                                    current.filter(
                                      (message) =>
                                        message.id !== failedTurn.optimisticId,
                                    ),
                                  );
                                  setFailedTurn({
                                    ...failedTurn,
                                    editing: true,
                                  });
                                }}
                              >
                                Edit request
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {showAssistant ? (
                      <div className="flex items-start gap-3 sm:gap-4">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                          <Bot className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-5">
                          <ToolActivity
                            tools={turn.tools}
                            busyToolId={decisionToolId}
                            now={confirmationNow}
                            onDecision={decide}
                          />

                          {turn.assistant?.content ? (
                            <AssistantMarkdown>
                              {turn.assistant.content}
                            </AssistantMarkdown>
                          ) : null}

                          {isLast && streamingText ? (
                            <div>
                              <AssistantMarkdown>
                                {streamingText}
                              </AssistantMarkdown>
                              <span
                                className="mt-1 inline-block h-4 w-1 animate-pulse bg-primary align-middle"
                                aria-hidden="true"
                              />
                            </div>
                          ) : null}

                          <AssistantResultCards
                            results={turn.tools
                              .filter((tool) => tool.status === "COMPLETED")
                              .map((tool) => tool.result)}
                            disabled={busy || Boolean(decisionToolId)}
                            onPrompt={(prompt) => void sendMessage(prompt)}
                          />

                          {isLast &&
                          busy &&
                          !streamingText &&
                          !turn.assistant ? (
                            <div
                              className="flex items-center gap-2 text-sm text-muted-foreground"
                              aria-hidden="true"
                            >
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              {turn.tools.length > 0
                                ? "Preparing the response…"
                                : "Working on your request…"}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 bg-background/95 p-3 backdrop-blur sm:p-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-[48rem] overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10"
          >
            {attachments.length > 0 ? (
              <div className="border-b bg-muted/20 px-3 py-2.5">
                <AttachmentChips
                  attachments={attachments.map((attachment) => ({
                    name: attachment.name,
                    mimeType: attachment.mimeType,
                    sizeBytes: attachment.sizeBytes,
                    kind: attachment.mimeType.startsWith("image/")
                      ? "IMAGE"
                      : "DOCUMENT",
                  }))}
                  onRemove={(index) =>
                    setAttachments((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                />
              </div>
            ) : null}
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit(event);
                }
              }}
              placeholder={
                pendingConfirmation
                  ? "Approve or cancel the pending action above"
                  : "Ask the assistant to manage your center…"
              }
              className="min-h-[5.5rem] resize-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none focus-visible:ring-0"
              disabled={
                !configured ||
                busy ||
                preparingAttachments ||
                pendingConfirmation ||
                isArchiving
              }
            />
            <div className="flex items-center justify-between gap-3 border-t bg-muted/15 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={
                    !configured ||
                    busy ||
                    preparingAttachments ||
                    pendingConfirmation ||
                    isArchiving ||
                    attachments.length >= MAX_ASSISTANT_ATTACHMENTS
                  }
                  onClick={() =>
                    document.getElementById("assistant-file-input")?.click()
                  }
                  aria-label="Attach image or document"
                >
                  {preparingAttachments ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Paperclip />
                  )}
                </Button>
                <input
                  id="assistant-file-input"
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  className="sr-only"
                  onChange={handleAttachmentChange}
                />
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                  {pendingConfirmation
                    ? "A sensitive action is waiting for your review."
                    : "Attach a calendar photo or document (3 MB total)."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-[11px] text-muted-foreground md:inline">
                  Shift + Enter for a new line
                </span>
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-xl"
                  disabled={
                    !configured ||
                    busy ||
                    preparingAttachments ||
                    pendingConfirmation ||
                    (!input.trim() && attachments.length === 0)
                  }
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Send />}
                  <span className="sr-only">Send message</span>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
