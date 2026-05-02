-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('PRIVATE', 'GROUP');

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "lessonType" "LessonType" NOT NULL DEFAULT 'PRIVATE';
