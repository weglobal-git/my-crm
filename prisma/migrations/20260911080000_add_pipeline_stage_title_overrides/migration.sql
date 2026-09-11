CREATE TABLE "PipelineStageTitleOverride" (
    "id" TEXT NOT NULL,
    "pipelineStageId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStageTitleOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PipelineStageTitleOverride_departmentId_idx"
ON "PipelineStageTitleOverride"("departmentId");

CREATE UNIQUE INDEX "PipelineStageTitleOverride_pipelineStageId_departmentId_key"
ON "PipelineStageTitleOverride"("pipelineStageId", "departmentId");

ALTER TABLE "PipelineStageTitleOverride"
ADD CONSTRAINT "PipelineStageTitleOverride_pipelineStageId_fkey"
FOREIGN KEY ("pipelineStageId") REFERENCES "PipelineStage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PipelineStageTitleOverride"
ADD CONSTRAINT "PipelineStageTitleOverride_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
