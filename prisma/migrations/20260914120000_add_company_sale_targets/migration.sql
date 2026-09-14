CREATE TABLE "CompanySaleTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySaleTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanySaleTarget_companyId_year_currency_key"
ON "CompanySaleTarget"("companyId", "year", "currency");

CREATE INDEX "CompanySaleTarget_year_currency_idx"
ON "CompanySaleTarget"("year", "currency");

ALTER TABLE "CompanySaleTarget"
ADD CONSTRAINT "CompanySaleTarget_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
