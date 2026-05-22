"use client";

import {
  BookOpenIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  GraduationCapIcon,
  RepeatIcon,
  UserRoundIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetaPill } from "@/components/meta-pill";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SessionEnrollment, SessionGroup } from "./session-form-types";

function EnrollmentMeta({
  enrollment,
  compact = false,
}: {
  enrollment: SessionEnrollment;
  compact?: boolean;
}) {
  return (
    <MetaPill
      compact={compact}
      items={[
        { icon: UserRoundIcon },
        {
          icon: enrollment.packageType === "MONTHLY" ? RepeatIcon : ZapIcon,
          label:
            enrollment.packageType === "MONTHLY"
              ? enrollment.sessionsPerWeek ?? "?"
              : "Per session",
          mobileLabel:
            enrollment.packageType === "MONTHLY"
              ? enrollment.sessionsPerWeek ?? "?"
              : "Per",
        },
        {
          icon: BookOpenIcon,
          label: enrollment.subjectName,
          hideLabelOnMobile: true,
        },
      ]}
    />
  );
}

function GroupMeta({
  group,
  compact = false,
}: {
  group: SessionGroup;
  compact?: boolean;
}) {
  return (
    <MetaPill
      compact={compact}
      items={[
        { icon: UsersIcon, label: group.memberCount },
        {
          icon: group.packageType === "PER_SESSION" ? ZapIcon : RepeatIcon,
          label:
            group.packageType === "PER_SESSION"
              ? "Per session"
              : group.sessionsPerWeek ?? "?",
          mobileLabel: group.packageType === "PER_SESSION" ? "Per" : group.sessionsPerWeek ?? "?",
        },
        {
          icon: BookOpenIcon,
          label: group.subjectName,
          hideLabelOnMobile: true,
        },
      ]}
    />
  );
}

function EnrollmentChoice({ enrollment }: { enrollment: SessionEnrollment }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{enrollment.studentName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {enrollment.packageName}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <GraduationCapIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{enrollment.tutorName}</span>
        </div>
      </div>
      <EnrollmentMeta enrollment={enrollment} />
    </div>
  );
}

function SelectedEnrollmentChoice({
  enrollment,
}: {
  enrollment: SessionEnrollment;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
      <div className="min-w-0 text-left">
        <div className="truncate font-medium">{enrollment.studentName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {enrollment.packageName}
          <span className="mx-1">·</span>
          {enrollment.tutorName}
        </div>
      </div>
      <EnrollmentMeta enrollment={enrollment} compact />
    </div>
  );
}

function GroupChoice({ group }: { group: SessionGroup }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{group.label}</div>
        <div className="truncate text-xs text-muted-foreground">
          {group.packageName || "Group package"}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <GraduationCapIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{group.tutorName}</span>
        </div>
      </div>
      <GroupMeta group={group} />
    </div>
  );
}

function SelectedGroupChoice({ group }: { group: SessionGroup }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
      <div className="min-w-0 text-left">
        <div className="truncate font-medium">{group.label}</div>
        <div className="truncate text-xs text-muted-foreground">
          {group.packageName || "Group package"}
          <span className="mx-1">·</span>
          {group.tutorName}
        </div>
      </div>
      <GroupMeta group={group} compact />
    </div>
  );
}

export function SessionEnrollmentPicker({
  open,
  onOpenChange,
  enrollmentId,
  groupId,
  enrollments,
  groups,
  emptyEnrollmentLabel,
  emptyEnrollmentValue,
  emptyEnrollmentMuted,
  onClear,
  onSelectEnrollment,
  onSelectGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  groupId: string;
  enrollments: SessionEnrollment[];
  groups: SessionGroup[];
  emptyEnrollmentLabel: string;
  emptyEnrollmentValue: string;
  emptyEnrollmentMuted?: boolean;
  onClear: () => void;
  onSelectEnrollment: (enrollment: SessionEnrollment) => void;
  onSelectGroup: (group: SessionGroup) => void;
}) {
  const selectedEnrollment = enrollments.find(
    (enrollment) => enrollment.id === enrollmentId,
  );
  const selectedGroup = groups.find((group) => group.id === groupId);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-auto min-h-14 w-full justify-between gap-3 py-2 font-normal"
        >
          {selectedGroup ? (
            <SelectedGroupChoice group={selectedGroup} />
          ) : selectedEnrollment ? (
            <SelectedEnrollmentChoice enrollment={selectedEnrollment} />
          ) : (
            <span className="min-w-0 truncate text-left text-muted-foreground">
              Search enrollments or groups...
            </span>
          )}
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup
            heading="Individual Enrollments"
            className="max-h-40 overflow-y-auto"
          >
            <CommandItem value={emptyEnrollmentValue} onSelect={onClear}>
              <CheckIcon
                className={cn(
                  "mr-2 h-4 w-4 shrink-0",
                  !enrollmentId && !groupId ? "opacity-100" : "opacity-0",
                )}
              />
              <span
                className={cn(emptyEnrollmentMuted && "text-muted-foreground")}
              >
                {emptyEnrollmentLabel}
              </span>
            </CommandItem>
            {enrollments.map((enrollment) => (
              <CommandItem
                key={enrollment.id}
                className="min-w-0"
                value={`${enrollment.studentName} ${enrollment.packageName ?? ""} ${enrollment.subjectName} ${enrollment.tutorName}`}
                onSelect={() => onSelectEnrollment(enrollment)}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    enrollmentId === enrollment.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <EnrollmentChoice enrollment={enrollment} />
              </CommandItem>
            ))}
          </CommandGroup>
          {groups.length > 0 && (
            <CommandGroup heading="Groups" className="max-h-40 overflow-y-auto">
              {groups.map((group) => (
                <CommandItem
                  key={group.id}
                  className="min-w-0"
                  value={`${group.label} ${group.packageName ?? ""} ${group.subjectName} ${group.tutorName}`}
                  onSelect={() => onSelectGroup(group)}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      groupId === group.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <GroupChoice group={group} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
