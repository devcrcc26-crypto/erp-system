-- CreateTable
CREATE TABLE "review_comment_document" (
    "id" TEXT NOT NULL,
    "review_comment_id" TEXT NOT NULL,
    "engineering_document_version_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "review_comment_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comment_file" (
    "id" TEXT NOT NULL,
    "review_comment_id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "review_comment_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_comment_document_review_comment_id_idx" ON "review_comment_document"("review_comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_comment_document_review_comment_id_engineering_docum_key" ON "review_comment_document"("review_comment_id", "engineering_document_version_id");

-- CreateIndex
CREATE INDEX "review_comment_file_review_comment_id_idx" ON "review_comment_file"("review_comment_id");

-- AddForeignKey
ALTER TABLE "review_comment_document" ADD CONSTRAINT "review_comment_document_review_comment_id_fkey" FOREIGN KEY ("review_comment_id") REFERENCES "review_comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment_document" ADD CONSTRAINT "review_comment_document_engineering_document_version_id_fkey" FOREIGN KEY ("engineering_document_version_id") REFERENCES "engineering_document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment_file" ADD CONSTRAINT "review_comment_file_review_comment_id_fkey" FOREIGN KEY ("review_comment_id") REFERENCES "review_comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment_file" ADD CONSTRAINT "review_comment_file_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
