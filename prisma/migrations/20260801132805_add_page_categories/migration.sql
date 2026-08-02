-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "category_id" UUID;

-- CreateTable
CREATE TABLE "page_categories" (
    "id" UUID NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{"vi": "", "en": "", "ru": "", "zh": ""}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_categories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "page_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
