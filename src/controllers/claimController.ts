import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { generateClaimNumber } from '../lib/numbering.js'

const prisma = new PrismaClient()

const VALID_TYPES = ['reclamo', 'consulta', 'sugerencia', 'denuncia']
const VALID_STATUSES = ['open', 'in_review', 'pending_info', 'resolved', 'closed']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent']

// ─── Usuario / Público ────────────────────────────────────────────────────────

export async function createClaim(req: Request, res: Response) {
  const { tenantSlug: headerTenant } = req.query
  const tenantSlug = req.tenantSlug ?? (headerTenant as string)

  if (!tenantSlug) {
    res.status(400).json({ error: 'tenant_slug required (query param or JWT)' })
    return
  }

  const { type = 'reclamo', subject, description, priority = 'medium', userName, userEmail } = req.body

  if (!subject || !description) {
    res.status(400).json({ error: 'subject and description required' })
    return
  }
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` })
    return
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` })
    return
  }

  try {
    const number = await generateClaimNumber(prisma, tenantSlug)

    const claim = await prisma.claim.create({
      data: {
        tenantSlug,
        number,
        userId: req.jwtPayload?.user_id ?? null,
        userName: req.jwtPayload?.username ?? userName ?? null,
        userEmail: userEmail ?? null,
        type,
        subject,
        description,
        priority,
      },
    })

    res.status(201).json(claim)
  } catch {
    res.status(500).json({ error: 'Failed to create claim' })
  }
}

export async function listMyClaims(req: Request, res: Response) {
  const payload = req.jwtPayload!
  const status = req.query.status as string | undefined

  try {
    const claims = await prisma.claim.findMany({
      where: {
        tenantSlug: req.tenantSlug!,
        userId: payload.user_id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(claims)
  } catch {
    res.status(500).json({ error: 'Failed to list claims' })
  }
}

export async function getClaim(req: Request, res: Response) {
  const id = req.params.id as string
  const payload = req.jwtPayload!

  try {
    const claim = await prisma.claim.findFirst({
      where: { id, tenantSlug: req.tenantSlug!, userId: payload.user_id },
      include: {
        updates: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' })
      return
    }
    res.json(claim)
  } catch {
    res.status(500).json({ error: 'Failed to get claim' })
  }
}

export async function trackClaim(req: Request, res: Response) {
  const number = req.params.number as string
  const { tenant } = req.query

  if (!tenant) {
    res.status(400).json({ error: 'tenant query param required' })
    return
  }

  try {
    const claim = await prisma.claim.findFirst({
      where: { tenantSlug: tenant as string, number },
      select: {
        id: true,
        number: true,
        subject: true,
        type: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        updates: {
          where: { authorRole: 'admin' },
          select: { message: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' })
      return
    }
    res.json(claim)
  } catch {
    res.status(500).json({ error: 'Failed to track claim' })
  }
}

export async function addUserUpdate(req: Request, res: Response) {
  const id = req.params.id as string
  const payload = req.jwtPayload!
  const { message } = req.body

  if (!message) {
    res.status(400).json({ error: 'message required' })
    return
  }

  try {
    const claim = await prisma.claim.findFirst({
      where: { id, tenantSlug: req.tenantSlug!, userId: payload.user_id },
    })
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' })
      return
    }
    if (claim.status === 'resolved' || claim.status === 'closed') {
      res.status(400).json({ error: `Cannot add update to a ${claim.status} claim` })
      return
    }

    const update = await prisma.claimUpdate.create({
      data: {
        claimId: id,
        authorId: payload.user_id,
        authorRole: 'user',
        message,
      },
    })

    // If claim was pending_info, reopen it
    if (claim.status === 'pending_info') {
      await prisma.claim.update({ where: { id }, data: { status: 'in_review' } })
    }

    res.status(201).json(update)
  } catch {
    res.status(500).json({ error: 'Failed to add update' })
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function adminListClaims(req: Request, res: Response) {
  const { status, type, priority, page = '1', limit = '20' } = req.query

  const skip = (Number(page) - 1) * Number(limit)

  try {
    const where = {
      tenantSlug: req.tenantSlug!,
      ...(status ? { status: status as string } : {}),
      ...(type ? { type: type as string } : {}),
      ...(priority ? { priority: priority as string } : {}),
    }

    const [claims, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.claim.count({ where }),
    ])

    res.json({ claims, total, page: Number(page), limit: Number(limit) })
  } catch {
    res.status(500).json({ error: 'Failed to list claims' })
  }
}

export async function adminGetClaim(req: Request, res: Response) {
  const id = req.params.id as string

  try {
    const claim = await prisma.claim.findFirst({
      where: { id, tenantSlug: req.tenantSlug! },
      include: {
        updates: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' })
      return
    }
    res.json(claim)
  } catch {
    res.status(500).json({ error: 'Failed to get claim' })
  }
}

export async function adminUpdateStatus(req: Request, res: Response) {
  const id = req.params.id as string
  const { status } = req.body

  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    return
  }

  try {
    const claim = await prisma.claim.findFirst({
      where: { id, tenantSlug: req.tenantSlug! },
    })
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' })
      return
    }

    const updated = await prisma.claim.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'resolved' ? new Date() : claim.resolvedAt,
      },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Failed to update status' })
  }
}

export async function adminAddUpdate(req: Request, res: Response) {
  const id = req.params.id as string
  const payload = req.jwtPayload!
  const { message } = req.body

  if (!message) {
    res.status(400).json({ error: 'message required' })
    return
  }

  try {
    const claim = await prisma.claim.findFirst({
      where: { id, tenantSlug: req.tenantSlug! },
    })
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' })
      return
    }

    const update = await prisma.claimUpdate.create({
      data: {
        claimId: id,
        authorId: payload.user_id,
        authorRole: 'admin',
        message,
      },
    })

    res.status(201).json(update)
  } catch {
    res.status(500).json({ error: 'Failed to add update' })
  }
}

export async function adminGetStats(req: Request, res: Response) {
  try {
    const tenantSlug = req.tenantSlug!

    const [byStatus, byType, total] = await Promise.all([
      prisma.claim.groupBy({
        by: ['status'],
        where: { tenantSlug },
        _count: { id: true },
      }),
      prisma.claim.groupBy({
        by: ['type'],
        where: { tenantSlug },
        _count: { id: true },
      }),
      prisma.claim.count({ where: { tenantSlug } }),
    ])

    res.json({
      total,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
      byType: Object.fromEntries(byType.map((r) => [r.type, r._count.id])),
    })
  } catch {
    res.status(500).json({ error: 'Failed to get stats' })
  }
}
