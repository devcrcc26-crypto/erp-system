-- CreateEnum
CREATE TYPE "EmailVerificationPurpose" AS ENUM ('ACCOUNT_ACTIVATION', 'EMAIL_CHANGE');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_verification_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" "EmailVerificationPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_email_verification_token_user_id" ON "email_verification_token"("user_id");

-- CreateIndex
CREATE INDEX "idx_email_verification_token_expires_at" ON "email_verification_token"("expires_at");

-- CreateIndex
CREATE INDEX "idx_email_verification_token_user_purpose" ON "email_verification_token"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
