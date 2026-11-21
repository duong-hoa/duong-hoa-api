import type { Prisma } from '@prisma/client'

// All updates that can change a draft revision share the block editor's page lock.
export async function lockPageForWrite(tx: Prisma.TransactionClient, pageId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pageId}))`
}
