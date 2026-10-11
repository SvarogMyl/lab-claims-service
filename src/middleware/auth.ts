import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface JwtPayload {
  user_id: number
  username: string
  roles: string[]
  tenant_slug?: string
  tenant_role?: string
}

declare global {
  namespace Express {
    interface Request {
      jwtPayload?: JwtPayload
      tenantSlug?: string
    }
  }
}

function verifyToken(req: Request, res: Response): JwtPayload | null {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Bearer token required' })
    return null
  }
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as JwtPayload
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
}

function extractToken(req: Request): JwtPayload | null {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as JwtPayload
  } catch {
    return null
  }
}

// Rutas de usuario autenticado — requiere tenant_slug en JWT
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const payload = verifyToken(req, res)
  if (!payload) return

  const tenantSlug = payload.tenant_slug
  if (!tenantSlug) {
    res.status(403).json({ error: 'Token must include tenant_slug for portal access' })
    return
  }

  req.jwtPayload = payload
  req.tenantSlug = tenantSlug
  next()
}

// Rutas admin — requiere tenant_slug + tenant_role admin, o roles de admin global
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const payload = verifyToken(req, res)
  if (!payload) return

  const isGlobalAdmin = payload.roles?.includes('admin')
  const isTenantAdmin = payload.tenant_role === 'tenant_admin' && !!payload.tenant_slug

  if (!isGlobalAdmin && !isTenantAdmin) {
    res.status(403).json({ error: 'Admin role required' })
    return
  }

  req.jwtPayload = payload
  req.tenantSlug = payload.tenant_slug ?? (req.query.tenant as string)
  next()
}

// Rutas opcionales — sin token: anónimo; con token: usuario identificado
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const payload = extractToken(req)
  if (payload) {
    req.jwtPayload = payload
    req.tenantSlug = payload.tenant_slug
  }
  next()
}

/** Un ex socio en modo solo consulta (spec-gestion-socios §2): el rol lo pone benefits al inhabilitarlo. */
export function isReadonlyMember(req: Request): boolean {
  return req.jwtPayload?.tenant_role === 'member_readonly'
}

/**
 * Rutas que crean o cambian algo a nombre del socio. Va **después** de `requireAuth`: un
 * `member_readonly` ve su historial pero no crea nada nuevo. Ocultar los botones no basta — sin
 * esto, un `POST` directo seguiría funcionando.
 */
export function requireWritable(req: Request, res: Response, next: NextFunction) {
  if (isReadonlyMember(req)) {
    res.status(403).json({
      error: 'Tu perfil de socio está inhabilitado: puedes consultar tu historial, pero no crear nada nuevo.',
      code: 'member_readonly',
    })
    return
  }
  next()
}
