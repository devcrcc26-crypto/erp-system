-- Rename InspectionRepairUrgency enum value to match schema.prisma
ALTER TYPE "InspectionRepairUrgency" RENAME VALUE 'CRITICALLY' TO 'CRITICAL';
