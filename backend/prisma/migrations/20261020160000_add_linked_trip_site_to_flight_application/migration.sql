-- AlterTable
ALTER TABLE "flight_application" ADD COLUMN "linked_business_trip_id" TEXT,
ADD COLUMN "site_assignment_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_flight_application_linked_business_trip" ON "flight_application"("linked_business_trip_id");

-- CreateIndex
CREATE INDEX "idx_flight_application_site_assignment" ON "flight_application"("site_assignment_id");

-- AddForeignKey
ALTER TABLE "flight_application" ADD CONSTRAINT "flight_application_linked_business_trip_id_fkey" FOREIGN KEY ("linked_business_trip_id") REFERENCES "business_trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_application" ADD CONSTRAINT "flight_application_site_assignment_id_fkey" FOREIGN KEY ("site_assignment_id") REFERENCES "site_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
