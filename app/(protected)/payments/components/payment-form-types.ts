export type PaymentStudentOption = { id: string; name: string };

export type PaymentEnrollmentOption = {
  id: string;
  studentId: string;
  label: string;
  packageType: "MONTHLY" | "PER_SESSION";
};
