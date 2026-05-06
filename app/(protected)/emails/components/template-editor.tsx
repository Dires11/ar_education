"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SaveIcon, Trash2Icon } from "lucide-react";
import {
  createEmailTemplateAction,
  updateEmailTemplateAction,
  deleteEmailTemplateAction,
} from "@/app/actions/emails";
import {
  emailTemplateSchema,
  type EmailTemplateInput,
} from "@/lib/validators/emails";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<string, string> = {
  PAYMENT_REMINDER: "Payment Reminder",
  SESSION_REMINDER: "Session Reminder",
  ANNOUNCEMENT: "Announcement",
  CUSTOM: "Custom",
};

const PLACEHOLDERS = [
  { tag: "@name", desc: "Student first name" },
  { tag: "@fullname", desc: "Student full name" },
  { tag: "@guardian", desc: "Guardian first name" },
  { tag: "@tutor", desc: "Tutor full name" },
  { tag: "@subject", desc: "Subject name" },
  { tag: "@amount", desc: "Payment amount" },
  { tag: "@month", desc: "Month (e.g. April 2026)" },
  { tag: "@center", desc: "AR Educational Center" },
];

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: string;
};

export function TemplateEditor({
  template,
  onSaved,
}: {
  template?: Template;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const form = useForm<EmailTemplateInput>({
    resolver: zodResolver(emailTemplateSchema),
    defaultValues: {
      name: template?.name ?? "",
      subject: template?.subject ?? "",
      body: template?.body ?? "",
      type: (template?.type as EmailTemplateInput["type"]) ?? "CUSTOM",
    },
  });

  async function onSubmit(values: EmailTemplateInput) {
    try {
      if (template) {
        await updateEmailTemplateAction(template.id, values);
        toast.success("Template updated");
      } else {
        await createEmailTemplateAction(values);
        toast.success("Template created");
      }
      router.refresh();
      onSaved?.();
    } catch {
      toast.error("Failed to save template");
    }
  }

  async function handleDelete() {
    if (!template) return;
    setDeleting(true);
    try {
      await deleteEmailTemplateAction(template.id);
      toast.success("Template deleted");
      router.refresh();
      onSaved?.();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleting(false);
    }
  }

  // Insert placeholder at cursor position in body textarea
  function insertPlaceholder(tag: string) {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-email-body]'
    );
    if (!textarea) {
      form.setValue("body", form.getValues("body") + tag);
      return;
    }
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const current = form.getValues("body");
    const next = current.slice(0, start) + tag + current.slice(end);
    form.setValue("body", next, { shouldDirty: true });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Template Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Monthly Payment Reminder" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Subject</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Payment reminder for @name — @month" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Placeholder chips */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Insert Placeholder
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.tag}
                type="button"
                title={p.desc}
                onClick={() => insertPlaceholder(p.tag)}
                className="rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors font-mono"
              >
                {p.tag}
              </button>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Body</FormLabel>
              <FormControl>
                <Textarea
                  data-email-body
                  rows={10}
                  placeholder={`Hello @guardian,\n\nThis is a reminder that payment of @amount is due for @name's @subject lessons for @month.\n\nPlease contact us to arrange payment.\n\nThank you,\n@center`}
                  className="font-mono text-sm resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <SaveIcon className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting
              ? "Saving..."
              : template
              ? "Save Changes"
              : "Create Template"}
          </Button>
          {template && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2Icon className="mr-2 h-4 w-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
