"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createSubjectAction,
  updateSubjectAction,
  deleteSubjectAction,
} from "@/app/actions/subjects";
import {
  createSubjectSchema,
  type CreateSubjectInput,
} from "@/lib/validators/subjects";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusIcon, PencilIcon, TrashIcon } from "lucide-react";

type Subject = { id: string; name: string; description: string | null };

export function SubjectsManager({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const addForm = useForm<CreateSubjectInput>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: { name: "", description: "" },
  });

  const editForm = useForm<CreateSubjectInput>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: { name: "", description: "" },
  });

  async function handleAdd(values: CreateSubjectInput) {
    try {
      await createSubjectAction(values);
      toast.success("Subject added");
      setIsAddOpen(false);
      addForm.reset();
      router.refresh();
    } catch {
      toast.error("Failed to add subject");
    }
  }

  async function handleEdit(values: CreateSubjectInput) {
    if (!editingSubject) return;
    try {
      await updateSubjectAction(editingSubject.id, values);
      toast.success("Subject updated");
      setEditingSubject(null);
      router.refresh();
    } catch {
      toast.error("Failed to update subject");
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteSubjectAction(id);
      toast.success("Subject deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete — subject may be in use");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Subject List</h2>
          <p className="text-xs text-muted-foreground">
            Subjects in use cannot be deleted without first removing linked packages and tutors.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="rounded-full">
            {subjects.length} subjects
          </Badge>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Subject
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Subject</DialogTitle>
              </DialogHeader>
              <Form {...addForm}>
                <form
                  onSubmit={addForm.handleSubmit(handleAdd)}
                  className="space-y-4"
                >
                  <FormField
                    control={addForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={addForm.formState.isSubmitting}
                    >
                      {addForm.formState.isSubmitting ? "Adding..." : "Add Subject"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="divide-y">
        {subjects.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No subjects yet. Add one to get started.
          </div>
        ) : (
          subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div>
                <p className="text-sm font-medium">{subject.name}</p>
                {subject.description && (
                  <p className="text-xs text-muted-foreground">
                    {subject.description}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Dialog
                  open={editingSubject?.id === subject.id}
                  onOpenChange={(open) => {
                    if (open) {
                      setEditingSubject(subject);
                      editForm.reset({
                        name: subject.name,
                        description: subject.description ?? "",
                      });
                    } else {
                      setEditingSubject(null);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <PencilIcon className="h-3.5 w-3.5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Subject</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                      <form
                        onSubmit={editForm.handleSubmit(handleEdit)}
                        className="space-y-4"
                      >
                        <FormField
                          control={editForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button
                            type="submit"
                            disabled={editForm.formState.isSubmitting}
                          >
                            {editForm.formState.isSubmitting
                              ? "Saving..."
                              : "Save Changes"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={deletingId === subject.id}
                  onClick={() => handleDelete(subject.id)}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
