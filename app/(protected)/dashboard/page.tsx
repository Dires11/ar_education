import Link from "next/link";
import { getDashboardStats } from "@/lib/services/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUSD } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/dates";
import { format } from "date-fns";
import {
  CalendarIcon,
  UsersIcon,
  AlertCircleIcon,
  PackageIcon,
  TrendingUpIcon,
  ClockIcon,
  ArrowRightIcon,
} from "lucide-react";
import { SessionsChart } from "./sessions-chart";
import { RevenueChart } from "./revenue-chart";

export default async function DashboardPage() {
  const {
    todaySessions,
    tomorrowSessions,
    activeStudentCount,
    upcomingEndings,
    tutorCounts,
    unpaidStudents,
    weeklySessionsByDay,
    monthlyRevenue,
  } = await getDashboardStats();

  const totalUnpaid = unpaidStudents.reduce(
    (sum, s) => sum + parseFloat(s.balance),
    0
  );

  const totalWeeklySessions = weeklySessionsByDay.reduce(
    (sum, d) => sum + d.sessions,
    0
  );

  const currentMonthRevenue = monthlyRevenue[monthlyRevenue.length - 1]?.revenue ?? 0;
  const prevMonthRevenue = monthlyRevenue[monthlyRevenue.length - 2]?.revenue ?? 0;
  const revenueChange =
    prevMonthRevenue > 0
      ? ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/students"
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            <UsersIcon className="h-3.5 w-3.5" />
            New Student
          </Link>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Schedule
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <CalendarIcon className="h-3 w-3" />
              Today&apos;s Sessions
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold">{todaySessions.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tomorrowSessions.length} tomorrow
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <UsersIcon className="h-3 w-3" />
              Active Students
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold">{activeStudentCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              enrolled &amp; active
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <AlertCircleIcon className="h-3 w-3" />
              Outstanding Balance
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-destructive">
              {formatUSD(totalUnpaid)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unpaidStudents.length} student{unpaidStudents.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <PackageIcon className="h-3 w-3" />
              Packages Ending
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold">{upcomingEndings.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">within 14 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Sessions This Week</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {totalWeeklySessions} session{totalWeeklySessions !== 1 ? "s" : ""} Mon–Sun
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                {totalWeeklySessions}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <SessionsChart data={weeklySessionsByDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Revenue (6 months)</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {formatUSD(currentMonthRevenue)} this month
                  {revenueChange !== null && (
                    <span
                      className={
                        revenueChange >= 0
                          ? "ml-1.5 text-emerald-600"
                          : "ml-1.5 text-destructive"
                      }
                    >
                      {revenueChange >= 0 ? "+" : ""}
                      {revenueChange.toFixed(1)}%
                    </span>
                  )}
                </CardDescription>
              </div>
              <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <RevenueChart data={monthlyRevenue} />
          </CardContent>
        </Card>
      </div>

      {/* Sessions + Balances Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Today's sessions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-muted-foreground" />
                Today&apos;s Schedule
              </CardTitle>
              <Badge variant="secondary">{todaySessions.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {todaySessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No sessions scheduled today
              </p>
            ) : (
              todaySessions.map((session) => (
                <Link
                  key={session.id}
                  href="/schedule"
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate group-hover:text-primary transition-colors">
                      {session.subject.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.tutor.firstName} {session.tutor.lastName}
                      {session.attendance.length > 0 &&
                        ` · ${session.attendance.map((a) => `${a.student.firstName} ${a.student.lastName}`).join(", ")}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                    {format(new Date(session.scheduledFor), "h:mm a")}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Outstanding balances */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />
                Outstanding Balances
              </CardTitle>
              {unpaidStudents.length > 0 && (
                <Badge variant="destructive">{unpaidStudents.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {unpaidStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                All students are paid up
              </p>
            ) : (
              <>
                {unpaidStudents.slice(0, 7).map((s) => (
                  <Link
                    key={s.id}
                    href="/students"
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors group"
                  >
                    <span className="font-medium group-hover:text-primary transition-colors">
                      {s.name}
                    </span>
                    <span className="font-semibold text-destructive">
                      {formatUSD(s.balance)}
                    </span>
                  </Link>
                ))}
                {unpaidStudents.length > 7 && (
                  <Link
                    href="/payments"
                    className="flex items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  >
                    +{unpaidStudents.length - 7} more
                    <ArrowRightIcon className="h-3 w-3" />
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Tomorrow's sessions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Tomorrow&apos;s Sessions</CardTitle>
              <Badge variant="secondary">{tomorrowSessions.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {tomorrowSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No sessions scheduled tomorrow
              </p>
            ) : (
              tomorrowSessions.map((session) => (
                <Link
                  key={session.id}
                  href="/schedule"
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate group-hover:text-primary transition-colors">
                      {session.subject.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.tutor.firstName} {session.tutor.lastName}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                    {format(new Date(session.scheduledFor), "h:mm a")}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Packages ending soon + Tutor load */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Packages Ending Soon</CardTitle>
                {upcomingEndings.length > 0 && (
                  <Badge variant="outline">{upcomingEndings.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {upcomingEndings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No packages ending in the next 14 days
                </p>
              ) : (
                upcomingEndings.slice(0, 5).map((e) => (
                  <Link
                    key={e.id}
                    href={`/enrollments/${e.id}`}
                    className="flex items-start justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-accent transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-medium group-hover:text-primary transition-colors">
                        {e.student.firstName} {e.student.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.subject.name} · {e.package.name}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                      {formatDate(e.endDate!)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {tutorCounts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Tutor Load This Week</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tutorCounts.map((t) => {
                  const maxCount = tutorCounts[0].count;
                  const pct = (t.count / maxCount) * 100;
                  return (
                    <div key={t.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {t.count} session{t.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-secondary">
                        <div
                          className="h-1.5 rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
