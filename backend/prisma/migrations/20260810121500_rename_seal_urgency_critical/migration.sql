-- Rename SealUrgency enum value to match schema.prisma
ALTER TYPE "SealUrgency" RENAME VALUE 'CRITICALLY' TO 'CRITICAL';
