import {
  createTutor,
  updateTutor,
  archiveTutor,
  setTutorSubjects,
  getTutor,
  getTutorPayrollSessions,
} from "@/lib/data/tutors";
import {
  createTutorSchema,
  updateTutorSchema,
  type CreateTutorInput,
  type UpdateTutorInput,
} from "@/lib/validators/tutors";
import { Prisma } from "../../generated/prisma";

export async function createTutorWithSubjects(input: CreateTutorInput) {
  const parsed = createTutorSchema.parse(input);
  const tutor = await createTutor(parsed);
  await setTutorSubjects(tutor.id, parsed.subjectIds);
  return tutor;
}

export async function updateTutorProfile(id: string, input: UpdateTutorInput) {
  const parsed = updateTutorSchema.parse(input);
  return updateTutor(id, parsed);
}

export async function updateTutorSubjectsList(
  tutorId: string,
  subjectIds: string[]
) {
  return setTutorSubjects(tutorId, subjectIds);
}

export async function archiveTutorById(id: string) {
  return archiveTutor(id);
}

export async function getTutorPayroll(
  tutorId: string,
  from: Date,
  to: Date
) {
  const tutor = await getTutor(tutorId);
  if (!tutor) return null;

  const sessions = await getTutorPayrollSessions(tutorId, from, to);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalHours = new Prisma.Decimal(totalMinutes).div(60);
  const earnings = totalHours.mul(tutor.hourlyRate);

  return {
    tutor,
    sessions,
    totalSessions: sessions.length,
    totalHours: totalHours.toNumber(),
    earnings,
  };
}

export { getTutor };
