import { listPackages } from "@/lib/data/packages";
import { listSubjects } from "@/lib/data/subjects";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUSD } from "@/lib/utils/money";
import { TogglePackageButton } from "./components/toggle-package-button";
import { NewPackageDialog } from "./components/new-package-dialog";
import { EditPackageDialog } from "./components/edit-package-dialog";
import { PageHero } from "@/components/page-hero";
import {
  ArchiveIcon,
  CalendarClockIcon,
  LayersIcon,
  SplitIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";

export default async function PackagesPage() {
  const [packages, subjects] = await Promise.all([
    listPackages(),
    listSubjects(),
  ]);

  const activeCount = packages.filter((p) => p.isActive).length;
  const subscriptionCount = packages.filter((p) => p.type === "MONTHLY").length;
  const perSessionCount = packages.filter(
    (p) => p.type === "PER_SESSION"
  ).length;

  return (
    <div className="space-y-6">
      <PageHero
        label="Package Catalog"
        title="Packages"
        description="Define tutoring packages with weekly session frequency, payment period, pricing, and duration."
        gradient="from-sky-50 via-background to-blue-50"
        stats={[
          { icon: LayersIcon, label: "Total", value: packages.length },
          { icon: ArchiveIcon, label: "Active", value: activeCount },
          { icon: CalendarClockIcon, label: "Subscriptions", value: subscriptionCount },
          { icon: SplitIcon, label: "Per Session", value: perSessionCount },
        ]}
        action={<NewPackageDialog subjects={subjects} />}
      />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Package List</h2>
            <p className="text-xs text-muted-foreground">
              Edit or toggle packages inline. Changes take effect immediately.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {packages.length} packages
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  No packages yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              packages.map((pkg) => (
                <TableRow
                  key={pkg.id}
                  className="transition-colors hover:bg-muted/40"
                >
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell>
                    {pkg.lessonType === "GROUP" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                        <UsersIcon className="h-3 w-3" />
                        Group
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <UserRoundIcon className="h-3 w-3" />
                        Private
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${pkg.type === "MONTHLY" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}
                    >
                      {pkg.type === "MONTHLY"
                        ? pkg.billingPeriod === "YEARLY"
                          ? "Yearly"
                          : pkg.billingPeriod === "THREE_MONTHS"
                          ? "3 months"
                          : "Monthly"
                        : "Per Session"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pkg.subject?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatUSD(pkg.basePrice)}
                    {pkg.type === "MONTHLY" && pkg.sessionsPerWeek && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        / {pkg.sessionsPerWeek}x week
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pkg.durationMinutes} min
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        pkg.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {pkg.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EditPackageDialog
                        packageId={pkg.id}
                        subjects={subjects}
                        defaultValues={{
                          name: pkg.name,
                          type: pkg.type as "MONTHLY" | "PER_SESSION",
                          billingPeriod: pkg.billingPeriod,
                          lessonType: pkg.lessonType as "PRIVATE" | "GROUP",
                          subjectId: pkg.subject?.id ?? "",
                          basePrice: pkg.basePrice.toString(),
                          sessionsPerWeek:
                            pkg.sessionsPerWeek?.toString() ?? "",
                          durationMinutes: pkg.durationMinutes.toString(),
                        }}
                      />
                      <TogglePackageButton
                        packageId={pkg.id}
                        isActive={pkg.isActive}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
