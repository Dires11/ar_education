import {
  getEmailRecipientContext,
  listEmailTemplates,
} from "@/lib/data/emails";
import { listStudents } from "@/lib/data/students";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MailIcon, LayoutTemplateIcon, SendIcon, PlusIcon } from "lucide-react";
import { TemplateEditor } from "./components/template-editor";
import { SendEmailForm } from "./components/send-email-form";

const TYPE_LABELS: Record<string, string> = {
  PAYMENT_REMINDER: "Payment",
  SESSION_REMINDER: "Session",
  ANNOUNCEMENT: "Announcement",
  CUSTOM: "Custom",
};

const TYPE_COLORS: Record<string, string> = {
  PAYMENT_REMINDER: "bg-blue-50 text-blue-700 border-blue-200",
  SESSION_REMINDER: "bg-teal-50 text-teal-700 border-teal-200",
  ANNOUNCEMENT: "bg-purple-50 text-purple-700 border-purple-200",
  CUSTOM: "bg-gray-50 text-gray-600 border-gray-200",
};

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; template?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab ?? "templates";

  const [templates, studentsData] = await Promise.all([
    listEmailTemplates(),
    listStudents({ status: "ACTIVE", pageSize: 300 }),
  ]);

  const studentIds = studentsData.students.map((s) => s.id);

  // Get guardian info and active enrollments in parallel
  const [guardianRows, enrollmentRows] =
    await getEmailRecipientContext(studentIds);

  const guardianMap = Object.fromEntries(
    guardianRows.map((sg) => [
      sg.studentId,
      {
        email: sg.guardian.email ?? null,
        firstName: sg.guardian.firstName ?? null,
      },
    ])
  );

  // Group enrollments by studentId
  const enrollmentsByStudent = enrollmentRows.reduce<
    Record<string, typeof enrollmentRows>
  >((acc, e) => {
    (acc[e.studentId] ??= []).push(e);
    return acc;
  }, {});

  const students = studentsData.students.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    name: `${s.firstName} ${s.lastName}`,
    email: s.email ?? null,
    guardianEmail: guardianMap[s.id]?.email ?? null,
    guardianFirstName: guardianMap[s.id]?.firstName ?? null,
    enrollments: (enrollmentsByStudent[s.id] ?? []).map((e) => ({
      tutorName: `${e.tutor.firstName} ${e.tutor.lastName}`,
      subjectName: e.subject.name,
      amount: (
        e.customPriceOverride ?? e.priceAtEnrollment
      ).toString(),
    })),
  }));

  const selectedTemplateId = params.template;
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <MailIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Emails</h1>
          <p className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? "s" : ""} · {students.length} students
          </p>
        </div>
      </div>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="templates" className="gap-1.5">
            <LayoutTemplateIcon className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="send" className="gap-1.5">
            <SendIcon className="h-4 w-4" />
            Send Email
          </TabsTrigger>
        </TabsList>

        {/* ── Templates tab ── */}
        <TabsContent value="templates" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* Template list */}
            <div className="space-y-2">
              <a
                href="/emails?tab=templates"
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 px-4 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                New template
              </a>
              {templates.map((t) => (
                <a
                  key={t.id}
                  href={`/emails?tab=templates&template=${t.id}`}
                  className={`block rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-muted/50 ${
                    selectedTemplateId === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[t.type] ?? TYPE_COLORS.CUSTOM}`}
                    >
                      {TYPE_LABELS[t.type] ?? t.type}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {t.subject}
                    </span>
                  </div>
                </a>
              ))}
              {templates.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  No templates yet. Create one to get started.
                </p>
              )}
            </div>

            {/* Editor */}
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">
                {selectedTemplate ? `Edit — ${selectedTemplate.name}` : "New Template"}
              </h2>
              <TemplateEditor
                key={selectedTemplate?.id ?? "new"}
                template={
                  selectedTemplate
                    ? {
                        id: selectedTemplate.id,
                        name: selectedTemplate.name,
                        subject: selectedTemplate.subject,
                        body: selectedTemplate.body,
                        type: selectedTemplate.type,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Send Email tab ── */}
        <TabsContent value="send" className="mt-4">
          <div className="max-w-2xl">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Send Email</h2>
              <SendEmailForm
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  subject: t.subject,
                  body: t.body,
                }))}
                students={students}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
