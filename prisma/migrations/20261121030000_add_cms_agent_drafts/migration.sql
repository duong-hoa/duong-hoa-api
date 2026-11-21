CREATE TABLE "cms_agent_drafts" (
    "page_id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "create_key" UUID NOT NULL,
    "create_signature" TEXT NOT NULL,
    "submitted_revision" TEXT,
    "review_note" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    CONSTRAINT "cms_agent_drafts_pkey" PRIMARY KEY ("page_id"),
    CONSTRAINT "cms_agent_drafts_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cms_agent_drafts_agent_key_create_key_key" ON "cms_agent_drafts"("agent_key", "create_key");
CREATE INDEX "activity_logs_target_table_target_id_created_at_idx" ON "activity_logs"("target_table", "target_id", "created_at");
