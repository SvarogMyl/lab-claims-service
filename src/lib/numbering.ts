import { PrismaClient } from '@prisma/client'

export async function generateClaimNumber(prisma: PrismaClient, tenantSlug: string): Promise<string> {
  const year = new Date().getFullYear()

  const counter = await prisma.claimCounter.upsert({
    where: { tenantSlug_year: { tenantSlug, year } },
    create: { tenantSlug, year, nextVal: 1 },
    update: { nextVal: { increment: 1 } },
  })

  return `REC-${year}-${String(counter.nextVal).padStart(3, '0')}`
}
