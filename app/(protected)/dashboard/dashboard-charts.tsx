"use client";

import dynamic from "next/dynamic";

const SessionsChart = dynamic(
  () => import("./sessions-chart").then((m) => ({ default: m.SessionsChart })),
  { ssr: false }
);

const RevenueChart = dynamic(
  () => import("./revenue-chart").then((m) => ({ default: m.RevenueChart })),
  { ssr: false }
);

export { SessionsChart, RevenueChart };
