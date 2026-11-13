CREATE TABLE "page_template_collections" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "page_template_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "page_template_collections_name_key" UNIQUE ("name")
);

ALTER TABLE "pages" ADD COLUMN "template_collection_id" UUID;
CREATE INDEX "pages_template_collection_id_is_template_idx" ON "pages"("template_collection_id", "is_template");
ALTER TABLE "pages" ADD CONSTRAINT "pages_template_collection_id_fkey"
  FOREIGN KEY ("template_collection_id") REFERENCES "page_template_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cms_preset_groups" (
  "id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_preset_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cms_preset_groups_kind_check" CHECK ("kind" IN ('block', 'page')),
  CONSTRAINT "cms_preset_groups_kind_name_key" UNIQUE ("kind", "name")
);

CREATE INDEX "cms_preset_groups_kind_created_at_idx" ON "cms_preset_groups"("kind", "created_at");
ALTER TABLE "cms_presets" ADD COLUMN "group_id" UUID;
ALTER TABLE "cms_presets" ADD CONSTRAINT "cms_presets_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "cms_preset_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cms_presets_group_id_idx" ON "cms_presets"("group_id");
