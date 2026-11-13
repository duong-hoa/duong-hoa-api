CREATE TABLE "cms_presets" (
  "id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_presets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cms_presets_kind_check" CHECK ("kind" IN ('block', 'page'))
);

CREATE INDEX "cms_presets_kind_scope_created_at_idx" ON "cms_presets"("kind", "scope", "created_at");

CREATE TABLE "cms_preset_selections" (
  "key" TEXT NOT NULL,
  "preset_id" UUID NOT NULL,
  CONSTRAINT "cms_preset_selections_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "cms_preset_selections_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "cms_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "cms_preset_page_baselines" (
  "page_id" UUID NOT NULL,
  "snapshot" JSONB NOT NULL,
  "source_scope" TEXT,
  CONSTRAINT "cms_preset_page_baselines_pkey" PRIMARY KEY ("page_id"),
  CONSTRAINT "cms_preset_page_baselines_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
