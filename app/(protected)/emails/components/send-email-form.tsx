"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  SendIcon,
  EyeIcon,
  EyeOffIcon,
  XIcon,
  InfoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendEmailAction } from "@/app/actions/emails";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

type StudentEnrollment = {
  tutorName: string;
  subjectName: string;
  amount: string;
};

type Student = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  guardianEmail: string | null;
  guardianFirstName: string | null;
  enrollments: StudentEnrollment[];
};

function substitutePlaceholders(
  text: string,
  ctx: Record<string, string>
): string {
  return Object.entries(ctx).reduce(
    (acc, [tag, val]) =>
      acc.replace(new RegExp(tag.replace("@", "\\@") + "\\b", "g"), val),
    text
  );
}

function buildPreviewContext(student: Student): Record<string, string> {
  const subjects = student.enrollments.map((e) => e.subjectName).join(", ");
  const tutors = [...new Set(student.enrollments.map((e) => e.tutorName))].join(", ");
  // For amount: use first enrollment (most recent); note if multiple
  const amount = student.enrollments[0]
    ? `$${student.enrollments[0].amount}`
    : "";

  return {
    "@name": student.firstName,
    "@fullname": student.name,
    "@guardian": student.guardianFirstName ?? student.firstName,
    "@tutor": tutors || "your tutor",
    "@subject": subjects || "your subject",
    "@amount": amount,
    "@month": new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    "@center": "AR Educational Center",
  };
}

export function SendEmailForm({
  templates,
  students,
}: {
  templates: Template[];
  students: Student[];
}) {
  const [templateId, setTemplateId] = useState<string>("custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  // Load template when selected
  useEffect(() => {
    if (templateId === "custom") return;
    const t = templates.find((t) => t.id === templateId);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }, [templateId, templates]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedIds(students.map((s) => s.id));
  }

  async function handleSend() {
    if (selectedIds.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    try {
      const result = await sendEmailAction({
        studentIds: selectedIds,
        subject,
        body,
      });
      toast.success(
        `Sent ${result.sent} email${result.sent !== 1 ? "s" : ""}${result.failed > 0 ? ` · ${result.failed} failed` : ""}`
      );
      setSelectedIds([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const selectedStudents = students.filter((s) => selectedIds.includes(s.id));
  // Use first selected student for preview; fall back to first student in list
  const previewStudent = selectedStudents[0] ?? students[0];
  const previewCtx = previewStudent ? buildPreviewContext(previewStudent) : null;

  function renderPreview(text: string): string {
    if (!previewCtx) return text;
    return substitutePlaceholders(text, previewCtx);
  }

  const hasMultipleEnrollments =
    previewStudent && previewStudent.enrollments.length > 1;

  return (
    <div className="space-y-5">
      {/* Template selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Start from template</label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a template..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom (blank)</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Subject</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject..."
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Body</label>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {preview ? (
              <>
                <EyeOffIcon className="h-3.5 w-3.5" /> Edit
              </>
            ) : (
              <>
                <EyeIcon className="h-3.5 w-3.5" /> Preview
              </>
            )}
          </button>
        </div>
        {preview ? (
          <div className="space-y-2">
            {/* Preview banner showing whose data is being used */}
            {previewStudent ? (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Preview using{" "}
                  <strong>
                    {selectedStudents.length > 0
                      ? selectedStudents[0].name
                      : previewStudent.name}
                  </strong>
                  &apos;s data
                  {selectedStudents.length > 1 &&
                    ` · each of the ${selectedStudents.length} recipients will receive a personalized version`}
                  {hasMultipleEnrollments && (
                    <>
                      {" · "}
                      <strong>multiple enrollments:</strong>{" "}
                      @subject and @tutor show all; @amount uses the most recent
                    </>
                  )}
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-muted px-3 py-2 text-xs text-muted-foreground">
                No students in the system — showing raw placeholders.
              </div>
            )}
            <div className="min-h-[200px] rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {renderPreview(body) || (
                <span className="text-muted-foreground italic">Empty body</span>
              )}
            </div>
            {/* Also preview the subject */}
            {subject && (
              <p className="text-xs text-muted-foreground">
                Subject preview:{" "}
                <span className="font-medium text-foreground">
                  {renderPreview(subject)}
                </span>
              </p>
            )}
          </div>
        ) : (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="resize-y font-mono text-sm"
            placeholder={`Hello @guardian,\n\nThis is a reminder that payment of @amount is due for @name's @subject lessons for @month.\n\nThank you,\n@center`}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Placeholders:{" "}
          {[
            "@name",
            "@fullname",
            "@guardian",
            "@tutor",
            "@subject",
            "@amount",
            "@month",
            "@center",
          ].join(" · ")}
        </p>
      </div>

      {/* Recipients */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            Recipients{" "}
            {selectedIds.length > 0 && (
              <span className="text-muted-foreground font-normal">
                ({selectedIds.length} selected)
              </span>
            )}
          </label>
          {selectedIds.length < students.length ? (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              Select all ({students.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-muted-foreground hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <Popover open={recipientsOpen} onOpenChange={setRecipientsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
            >
              {selectedIds.length === 0 ? (
                <span className="text-muted-foreground">Add recipients...</span>
              ) : (
                <span>
                  {selectedIds.length} student
                  {selectedIds.length !== 1 ? "s" : ""} selected
                </span>
              )}
              <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Search students..." />
              <CommandEmpty>No students found.</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-y-auto">
                {students.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.name}
                    onSelect={() => toggleStudent(s.id)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selectedIds.includes(s.id)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border"
                      )}
                    >
                      {selectedIds.includes(s.id) && (
                        <CheckIcon className="h-3 w-3" />
                      )}
                    </div>
                    <span>{s.name}</span>
                    {s.enrollments.length > 1 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {s.enrollments.length} enrollments
                      </span>
                    )}
                    {!s.email && !s.guardianEmail && (
                      <span className="ml-auto text-xs text-muted-foreground italic">
                        no email
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Selected chips */}
        {selectedStudents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selectedStudents.map((s) => (
              <Badge
                key={s.id}
                variant="secondary"
                className="gap-1 pr-1 text-xs"
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => toggleStudent(s.id)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={handleSend}
        disabled={sending || selectedIds.length === 0}
        className="w-full"
      >
        <SendIcon className="mr-2 h-4 w-4" />
        {sending
          ? "Sending..."
          : `Send to ${selectedIds.length > 0 ? `${selectedIds.length} student${selectedIds.length !== 1 ? "s" : ""}` : "..."}`}
      </Button>
    </div>
  );
}
