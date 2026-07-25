import "server-only";

import { prisma } from "@/lib/prisma";

export async function isCloudinaryImageReferenced(publicId: string) {
  const [students, tutors, guardians] = await Promise.all([
    prisma.student.count({ where: { avatarPublicId: publicId } }),
    prisma.tutor.count({ where: { avatarPublicId: publicId } }),
    prisma.guardian.count({ where: { avatarPublicId: publicId } }),
  ]);
  return students + tutors + guardians > 0;
}
