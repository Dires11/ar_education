"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MailIcon,
  UserXIcon,
  ShieldIcon,
  UserIcon,
  SendIcon,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  inviteTeamMember,
  revokeTeamInvitation,
  updateTeamMemberRole,
  removeTeamMember,
} from "@/app/actions/team";

type Role = "OWNER" | "STAFF";

type AdminRow = { id: string; name: string; email: string; role: Role };
type InviteRow = { id: string; emailAddress: string };

const ROLE_CONFIG: Record<Role, { label: string; icon: typeof ShieldIcon; className: string }> = {
  OWNER: {
    label: "Owner",
    icon: ShieldIcon,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  STAFF: {
    label: "Staff",
    icon: UserIcon,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", cfg.className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export function TeamMembers({
  admins,
  pendingInvitations,
  isOwner,
  currentAdminId,
}: {
  admins: AdminRow[];
  pendingInvitations: InviteRow[];
  isOwner: boolean;
  currentAdminId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    startTransition(async () => {
      try {
        await inviteTeamMember(inviteEmail.trim());
        toast.success(`Invitation sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
        refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to send invitation");
      }
    });
  }

  async function handleRevoke(invitationId: string, email: string) {
    setLoadingId(invitationId);
    try {
      await revokeTeamInvitation(invitationId);
      toast.success(`Invitation to ${email} revoked`);
      refresh();
    } catch {
      toast.error("Failed to revoke invitation");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleChangeRole(adminId: string, role: Role) {
    setLoadingId(adminId);
    try {
      await updateTeamMemberRole(adminId, role);
      toast.success("Role updated");
      refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleRemove(adminId: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    setLoadingId(adminId);
    try {
      await removeTeamMember(adminId);
      toast.success(`${name} has been removed`);
      refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Members
            <Badge variant="secondary" className="ml-2">{admins.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Everyone with access to the CRM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {admins.map((admin) => {
            const isSelf = admin.id === currentAdminId;
            return (
              <div
                key={admin.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                  {admin.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{admin.name}</span>
                    {isSelf && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                </div>

                {isOwner && !isSelf ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={admin.role}
                      onValueChange={(v) => handleChangeRole(admin.id, v as Role)}
                      disabled={loadingId === admin.id}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNER">Owner</SelectItem>
                        <SelectItem value="STAFF">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={loadingId === admin.id}
                      onClick={() => handleRemove(admin.id, admin.name)}
                    >
                      <UserXIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <RoleBadge role={admin.role} />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {(pendingInvitations.length > 0 || isOwner) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Pending Invitations
              {pendingInvitations.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingInvitations.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Invites that haven&apos;t been accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvitations.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No pending invitations
              </p>
            ) : (
              pendingInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5"
                >
                  <MailIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-sm">{invite.emailAddress}</p>
                  <Badge
                    variant="outline"
                    className="text-xs text-amber-700 border-amber-200 bg-amber-50 shrink-0"
                  >
                    Pending
                  </Badge>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      disabled={loadingId === invite.id}
                      onClick={() => handleRevoke(invite.id, invite.emailAddress)}
                    >
                      <XCircleIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite form — owners only */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Invite Someone</CardTitle>
            <CardDescription className="text-xs">
              They&apos;ll receive an email to join the CRM
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-1">
                <Label htmlFor="invite-email" className="text-xs">
                  Email address
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1 sm:self-end">
                <div className="hidden sm:block text-xs">&nbsp;</div>
                <Button
                  type="submit"
                  disabled={isPending || !inviteEmail.trim()}
                  className="h-9 gap-1.5 w-full sm:w-auto"
                >
                  <SendIcon className="h-3.5 w-3.5" />
                  {isPending ? "Sending…" : "Send Invite"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
