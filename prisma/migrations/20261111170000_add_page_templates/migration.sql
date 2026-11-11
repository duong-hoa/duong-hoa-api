ALTER TABLE "pages" ADD COLUMN "is_template" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pages" ADD COLUMN "template_name" TEXT;
CREATE INDEX "pages_is_template_updated_at_idx" ON "pages"("is_template", "updated_at");
