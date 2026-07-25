import "server-only";

import { addDays } from "date-fns";
import {
  materializeGroupSessions,
  materializeSessions,
} from "@/lib/services/session-materialization";

const MATERIALIZATION_WINDOW_DAYS = 30;

export async function materializeUpcomingSessions(now = new Date()) {
  const through = addDays(now, MATERIALIZATION_WINDOW_DAYS);
  const [individual, group] = await Promise.all([
    materializeSessions(now, through),
    materializeGroupSessions(now, through),
  ]);

  return {
    individual,
    group,
    total: individual + group,
    through,
  };
}
