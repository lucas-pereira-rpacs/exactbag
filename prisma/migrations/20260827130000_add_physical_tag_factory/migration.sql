-- Create the singleton configuration table for physical SUN tag numbers.
CREATE TABLE "PhysicalTagFactory" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "InsuredSunNumberStarting" TEXT NOT NULL DEFAULT '9110001',
    "NonInsuredSunNumberStarting" TEXT NOT NULL DEFAULT 'S1010001',
    "InsuredSunNumberLast" TEXT NOT NULL DEFAULT 'S1024290',
    "NonInsuredSunNumberLast" TEXT NOT NULL DEFAULT '91208408',

    CONSTRAINT "PhysicalTagFactory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhysicalTagFactory_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "PhysicalTagFactory" ("id")
VALUES (1);
