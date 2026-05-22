"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2Icon } from "lucide-react";
import { toast } from "sonner";
import { updateGroupAction } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EnrollmentGroupOption } from "./enrollment-form-types";

export function ManageGroupsDialog({
  groups,
}: {
  groups: EnrollmentGroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.name]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  async function saveGroup(group: EnrollmentGroupOption) {
    const name = names[group.id]?.trim() ?? "";
    if (!name) {
      toast.error("Group name is required");
      return;
    }
    if (name === group.name) return;

    setSavingId(group.id);
    try {
      await updateGroupAction(group.id, { name });
      toast.success("Group updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update group");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-center sm:w-auto">
          <Settings2Icon className="mr-2 h-4 w-4" />
          Manage Groups
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Groups</DialogTitle>
          <DialogDescription>
            Rename active groups. Empty groups are removed automatically when
            their last active member leaves.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Tutor</TableHead>
                <TableHead>Members</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No groups yet
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => {
                  const currentName = names[group.id] ?? group.name;
                  const unchanged = currentName.trim() === group.name;

                  return (
                    <TableRow key={group.id}>
                      <TableCell>
                        <Input
                          value={currentName}
                          onChange={(event) =>
                            setNames((current) => ({
                              ...current,
                              [group.id]: event.target.value,
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {group.subjectName ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {group.tutorName ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {group.memberCount}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          disabled={unchanged || savingId === group.id}
                          onClick={() => saveGroup(group)}
                        >
                          {savingId === group.id ? "Saving" : "Save"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
