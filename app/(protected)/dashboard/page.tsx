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
  TrendingUpIcon,
  PackageIcon,
} from "lucide-react";

export default async function DashboardPage() {
  const {
    todaySessions,
    tomorrowSessions,
    activeStudentCount,
    upcomingEndings,
    tutorCounts,
    unpaidStudents,
  } = await getDashboardStats();

  const totalUnpaid = unpaidStudents.reduce(
    (sum, s) => sum + parseFloat(s.balance),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              Today&apos;s Sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{todaySessions.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" />
              Active Students
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeStudentCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              Unpaid Balances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">
              {formatUSD(totalUnpaid)}
            </p>
            <p className="text-xs text-muted-foreground">
              {unpaidStudents.length} student{unpaidStudents.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <PackageIcon className="h-3.5 w-3.5" />
              Ending Soon
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{upcomingEndings.length}</p>
            <p className="text-xs text-muted-foreground">within 14 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Today's sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Today&apos;s Sessions
              <Badge variant="secondary" className="ml-2">
                {todaySessions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions today</p>
            ) : (
              todaySessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-start justify-between rounded-md border p-2.5 text-sm"
                >
                  <div className="space-y-0.5">
                    <Link
                      href={`/schedule/${session.id}`}
                      className="font-medium hover:underline"
                    >
                      {session.subject.name}
                    </Link>
                    <p className="text-muted-foreground">
                      {session.tutor.firstName} {session.tutor.lastName}
                    </p>
                    {session.attendance.length > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {session.attendance
                          .map(
                            (a) =>
                              `${a.student.firstName} ${a.student.lastName}`
                          )
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(session.scheduledFor), "h:mm a")}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Tomorrow's sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Tomorrow&apos;s Sessions
              <Badge variant="secondary" className="ml-2">
                {tomorrowSessions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tomorrowSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sessions tomorrow
              </p>
            ) : (
              tomorrowSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-start justify-between rounded-md border p-2.5 text-sm"
                >
                  <div className="space-y-0.5">
                    <Link
                      href={`/schedule/${session.id}`}
                      className="font-medium hover:underline"
                    >
                      {session.subject.name}
                    </Link>
                    <p className="text-muted-foreground">
                      {session.tutor.firstName} {session.tutor.lastName}
                    </p>
                    {session.attendance.length > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {session.attendance
                          .map(
                            (a) =>
                              `${a.student.firstName} ${a.student.lastName}`
                          )
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(session.scheduledFor), "h:mm a")}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Unpaid balances */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Outstanding Balances
              {unpaidStudents.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unpaidStudents.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unpaidStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All students are paid up
              </p>
            ) : (
              unpaidStudents.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-sm"
                >
                  <Link
                    href={`/students/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="font-semibold text-destructive">
                    {formatUSD(s.balance)}
                  </span>
                </div>
              ))
            )}
            {unpaidStudents.length > 8 && (
              <p className="text-xs text-muted-foreground">
                +{unpaidStudents.length - 8} more
              </p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming package endings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Packages Ending Soon
              {upcomingEndings.length > 0 && (
                <Badge variant="outline" className="ml-2">
                  {upcomingEndings.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingEndings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No enrollments ending in the next 14 days
              </p>
            ) : (
              upcomingEndings.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between text-sm"
                >
                  <div className="space-y-0.5">
                    <Link
                      href={`/enrollments/${e.id}`}
                      className="font-medium hover:underline"
                    >
                      {e.student.firstName} {e.student.lastName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {e.subject.name} · {e.package.name}
                    </p>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDate(e.endDate!)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tutor session counts this week */}
      {tutorCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUpIcon className="h-4 w-4" />
              Tutor Sessions This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {tutorCounts.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="secondary">{t.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
