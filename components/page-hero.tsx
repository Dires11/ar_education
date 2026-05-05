import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Stat = {
  icon: LucideIcon;
  label: string;
  value: string | number;
};

export function PageHero({
  label,
  title,
  description,
  gradient,
  stats,
  action,
  footer,
}: {
  label: string;
  title: string;
  description: string;
  gradient: string;
  stats?: Stat[];
  action?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const colsClass =
    !stats || stats.length <= 1
      ? "grid-cols-1"
      : stats.length === 2
        ? "grid-cols-2"
        : stats.length === 4
          ? "grid-cols-2 lg:grid-cols-4"
          : "grid-cols-3";

  return (
    <section
      className={`overflow-hidden rounded-3xl border bg-gradient-to-br ${gradient}`}
    >
      <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <Badge variant="outline" className="rounded-full bg-background/80">
            {label}
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          {stats && stats.length > 0 && (
            <div className={`grid gap-3 ${colsClass}`}>
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border bg-background/80 px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start gap-1.5 text-muted-foreground min-h-[2rem]">
                    <stat.icon className="hidden sm:block h-3.5 w-3.5 shrink-0 mt-px" />
                    <span className="text-[10px] uppercase tracking-wider leading-tight">
                      {stat.label}
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {(action || footer) && (
          <div className="flex flex-col gap-3 lg:items-end">
            {action}
            {footer && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {footer}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
