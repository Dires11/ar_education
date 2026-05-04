import { requireAdmin } from "@/lib/utils/auth";
import { getTeamPageData } from "@/lib/services/team";
import { PageHero } from "@/components/page-hero";
import { TeamMembers } from "./components/team-members";
import { UsersIcon, ShieldIcon, MailIcon } from "lucide-react";

export default async function TeamPage() {
  const currentAdmin = await requireAdmin();
  const isOwner = currentAdmin.role === "OWNER";
  const { admins, pendingInvitations } = await getTeamPageData();
  const ownerCount = admins.filter((a) => a.role === "OWNER").length;

  return (
    <div className="space-y-6">
      <PageHero
        label="Team Management"
        title="Team"
        description="Manage who has access to the CRM. Invite colleagues, assign roles, and remove members."
        gradient="from-slate-50 via-background to-indigo-50"
        stats={[
          { icon: UsersIcon, label: "Members", value: admins.length },
          { icon: ShieldIcon, label: "Owners", value: ownerCount },
          { icon: MailIcon, label: "Pending Invites", value: pendingInvitations.length },
        ]}
      />
      <TeamMembers
        admins={admins.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          role: a.role as "OWNER" | "STAFF",
        }))}
        pendingInvitations={pendingInvitations.map((i) => ({
          id: i.id,
          emailAddress: i.emailAddress,
        }))}
        isOwner={isOwner}
        currentAdminId={currentAdmin.id}
      />
    </div>
  );
}
