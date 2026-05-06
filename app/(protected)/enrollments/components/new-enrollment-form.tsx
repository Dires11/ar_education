"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  BanknoteIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleDollarSign,
  ClockIcon,
  RepeatIcon,
  UserRoundIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { createEnrollmentAction } from "@/app/actions/enrollments";
import {
  createEnrollmentSchema,
  type CreateEnrollmentInput,
} from "@/lib/validators/enrollments";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

type Student = { id: string; name: string };
type Tutor = { id: string; name: string; subjectIds: string[] };
type Subject = { id: string; name: string };
type Package = {
  id: string;
  name: string;
  type: string;
  lessonType: string;
  basePrice: string;
  subjectId: string | null;
};

type Group = {
  id: string;
  name: string;
  tutorId: string;
  subjectId: string;
  memberCount: number;
};

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected?.label ?? (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? "Search..."} />
          <CommandEmpty>{emptyText ?? "No options found."}</CommandEmpty>
          <CommandGroup className="max-h-52 overflow-y-auto">
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === o.value ? "opacity-100" : "opacity-0",
                  )}
                />
                {o.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function NewEnrollmentForm({
  students,
  tutors,
  subjects,
  packages,
  groups,
  defaultStudentId,
  onSuccess,
}: {
  students: Student[];
  tutors: Tutor[];
  subjects: Subject[];
  packages: Package[];
  groups: Group[];
  defaultStudentId?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const form = useForm<CreateEnrollmentInput>({
    resolver: zodResolver(createEnrollmentSchema),
    defaultValues: {
      studentId: defaultStudentId ?? "",
      packageId: "",
      tutorId: "",
      subjectId: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      customPriceOverride: "",
      groupId: "",
      newGroupName: "",
    },
  });

  const selectedPackageId = useWatch({
    control: form.control,
    name: "packageId",
  });
  const selectedSubjectId = useWatch({
    control: form.control,
    name: "subjectId",
  });
  const selectedTutorId = useWatch({ control: form.control, name: "tutorId" });
  const watchedGroupId = useWatch({ control: form.control, name: "groupId" });
  const watchedNewGroupName = useWatch({
    control: form.control,
    name: "newGroupName",
  });

  const selectedPackage = packages.find((p) => p.id === selectedPackageId);

  const isGroupPackage = selectedPackage?.lessonType === "GROUP";

  const [creatingNewGroup, setCreatingNewGroup] = useState(false);

  const availableGroups = groups.filter(
    (g) =>
      (!selectedTutorId || g.tutorId === selectedTutorId) &&
      (!selectedSubjectId || g.subjectId === selectedSubjectId),
  );

  // When the package changes, auto-set or clear the subject, and reset tutor
  useEffect(() => {
    if (!selectedPackageId) return;
    if (selectedPackage?.subjectId) {
      form.setValue("subjectId", selectedPackage.subjectId, {
        shouldValidate: true,
      });
    } else {
      form.setValue("subjectId", "");
    }
    form.setValue("tutorId", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPackageId]);

  useEffect(() => {
    form.setValue("groupId", "");
    setCreatingNewGroup(false);
    form.setValue("newGroupName", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTutorId, selectedSubjectId]);

  // Subject is asked only when the selected package has no fixed subject
  const isAnySubjectPackage =
    selectedPackage !== undefined && selectedPackage.subjectId === null;

  // Derive the resolved subject for tutor filtering
  const resolvedSubjectId = selectedSubjectId || null;

  const availableTutors = resolvedSubjectId
    ? tutors.filter((t) => t.subjectIds.includes(resolvedSubjectId))
    : selectedPackageId
      ? tutors // package selected but no subject yet — show all
      : tutors;

  const packageSubjectName = selectedPackage?.subjectId
    ? subjects.find((s) => s.id === selectedPackage.subjectId)?.name
    : null;

  async function onSubmit(values: CreateEnrollmentInput) {
    if (isGroupPackage && !values.groupId && !values.newGroupName) {
      form.setError("groupId", {
        message: "Group is required for group packages",
      });
      return;
    }
    try {
      const result = await createEnrollmentAction(values);
      if (result.success) {
        toast.success("Enrollment created");
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/enrollments");
        }
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create enrollment",
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
        {/* Student */}
        <FormField
          control={form.control}
          name="studentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Student</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={students.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search students..."
                  searchPlaceholder="Type a name..."
                  emptyText="No students found."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Package */}
        <FormField
          control={form.control}
          name="packageId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package</FormLabel>
              <div className="flex items-center gap-2 flex-wrap">
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a package" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          ${p.basePrice}
                          {p.type === "MONTHLY" ? "/period" : "/session"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPackage && (
                  <div className="flex shrink-0 items-center gap-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {selectedPackage.type === "MONTHLY" ? (
                      <RepeatIcon className="h-3.5 w-3.5" />
                    ) : (
                      <ZapIcon className="h-3.5 w-3.5" />
                    )}
                    {selectedPackage.lessonType === "GROUP" ? (
                      <UsersIcon className="h-3.5 w-3.5" />
                    ) : (
                      <UserRoundIcon className="h-3.5 w-3.5" />
                    )}
                    <span className="flex items-center gap-1">
                      <CircleDollarSign className="h-3.5 w-3.5" />
                      <span className="font-medium text-foreground">
                        {selectedPackage.basePrice}
                      </span>
                    </span>
                    {(packageSubjectName || isAnySubjectPackage) && (
                      <span className="flex items-center gap-1">
                        <BookOpenIcon className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">
                          {packageSubjectName ?? "Any"}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Subject — only when package is any-subject */}
        {isAnySubjectPackage && (
          <FormField
            control={form.control}
            name="subjectId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subject</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject for this enrollment" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Tutor */}
        <FormField
          control={form.control}
          name="tutorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tutor</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={availableTutors.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={
                    !selectedPackageId
                      ? "Select a package first"
                      : isAnySubjectPackage && !resolvedSubjectId
                        ? "Select a subject first"
                        : "Search tutors..."
                  }
                  searchPlaceholder="Type a name..."
                  emptyText="No tutors teach this subject."
                  disabled={
                    !selectedPackageId ||
                    (isAnySubjectPackage && !resolvedSubjectId)
                  }
                />
              </FormControl>
              {resolvedSubjectId && availableTutors.length === 0 && (
                <p className="text-xs text-amber-600">
                  No tutors are assigned to this subject. Add subjects to a
                  tutor first.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Group — only for GROUP packages */}
        {isGroupPackage && (
          <FormField
            control={form.control}
            name="groupId"
            render={() => (
              <FormItem className="w-full">
                <FormLabel>Group</FormLabel>
                {!creatingNewGroup && availableGroups.length > 0 ? (
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        options={availableGroups.map((g) => ({
                          value: g.id,
                          label: `${g.name} (${g.memberCount} student${g.memberCount !== 1 ? "s" : ""})`,
                        }))}
                        value={watchedGroupId ?? ""}
                        onChange={(v) => {
                          form.setValue("groupId", v);
                          form.clearErrors("groupId");
                        }}
                        placeholder="Select a group..."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        setCreatingNewGroup(true);
                        form.setValue("groupId", "");
                      }}
                    >
                      Create New
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 min-w-0"
                      value={watchedNewGroupName}
                      onChange={(e) => {
                        form.setValue("newGroupName", e.target.value);
                        if (e.target.value) form.clearErrors("groupId");
                      }}
                      placeholder="Group name (e.g. Monday Math Beginners)"
                      autoFocus
                    />
                    {availableGroups.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setCreatingNewGroup(false);
                          form.setValue("newGroupName", "");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Start Date
                  </div>
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    End Date
                    <span className="text-xs font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </div>
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Custom price */}
        <FormField
          control={form.control}
          name="customPriceOverride"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <div className="flex items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Custom Price
                  <span className="text-xs font-normal text-muted-foreground">
                    (optional)
                  </span>
                </div>
              </FormLabel>
              <div className="flex items-center gap-3">
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={
                      selectedPackage
                        ? `${Number(Number(selectedPackage.basePrice) * 0.8).toFixed(2)}`
                        : "Override package price"
                    }
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-1">
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="flex-1"
          >
            {form.formState.isSubmitting ? "Creating..." : "Create Enrollment"}
          </Button>
          {!onSuccess && (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
