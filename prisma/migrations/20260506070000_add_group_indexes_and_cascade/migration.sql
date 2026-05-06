-- CreateIndex
CREATE INDEX "Group_tutorId_idx" ON "Group"("tutorId");

-- CreateIndex
CREATE INDEX "Group_subjectId_idx" ON "Group"("subjectId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Group_tutorId_name_key" ON "Group"("tutorId", "name");
