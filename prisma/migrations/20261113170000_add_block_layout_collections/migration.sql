CREATE TABLE "block_layout_collections" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "block_layout_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "block_layout_collections_name_key" UNIQUE ("name")
);

CREATE TABLE "block_layout_collection_assignments" (
  "scope" TEXT NOT NULL,
  "block_type" TEXT NOT NULL,
  "collection_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "block_layout_collection_assignments_pkey" PRIMARY KEY ("scope"),
  CONSTRAINT "block_layout_collection_assignments_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "block_layout_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "block_layout_collection_assignments_collection_id_idx"
  ON "block_layout_collection_assignments"("collection_id");
