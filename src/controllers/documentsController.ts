import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import {
  buildKey,
  putDocument,
  openDocument,
  documentExists,
  deleteDocument,
  MAX_FILE_BYTES,
} from '../lib/storage.js'

const prisma = new PrismaClient()

function isAdmin(req: Request): boolean {
  const p = req.jwtPayload!
  return Boolean(p.roles?.includes('admin') || p.tenant_role === 'tenant_admin')
}

/**
 * Quién puede tocar los adjuntos de un reclamo.
 *
 * ⚠️ **Los reclamos anónimos quedan fuera a propósito.** `createClaim` usa `optionalAuth`, así
 * que existen reclamos con `userId: null`; para ésos no hay forma de comprobar que quien dice
 * ser el autor lo sea —el número de seguimiento circula por correo y es lo único que hay—, y un
 * adjunto puede contener datos de terceros. Sólo el admin ve los suyos.
 *
 * Devuelve `null` si el reclamo no existe en este tenant: el llamador responde 404 y no 403,
 * para no delatar que el id existe en otra organización.
 */
async function findClaimFor(
  req: Request,
  claimId: string
): Promise<{ id: string; userId: number | null } | null> {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, tenantSlug: req.tenantSlug! },
    select: { id: true, userId: true },
  })
  return claim ?? null
}

function canAccess(req: Request, claim: { userId: number | null }): boolean {
  if (isAdmin(req)) return true
  return claim.userId !== null && claim.userId === req.jwtPayload!.user_id
}

export async function uploadDocument(req: Request, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: 'file required' })
    return
  }

  const claimId = req.params.id as string
  const claim = await findClaimFor(req, claimId)
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' })
    return
  }
  if (!canAccess(req, claim)) {
    res.status(403).json({ error: 'Not allowed' })
    return
  }

  const key = buildKey(req.tenantSlug!, claimId, req.file.originalname, req.file.mimetype)

  try {
    await putDocument(key, req.file.buffer)
  } catch {
    res.status(502).json({ error: 'No se pudo guardar el archivo' })
    return
  }

  // Sólo después de que el archivo quedó escrito: una fila que apunta a un archivo inexistente
  // es peor que no tener fila, porque el adjunto se ve en la lista y falla al abrirse.
  const doc = await prisma.claimDocument.create({
    data: {
      claimId,
      filename: req.file.originalname.slice(0, 255),
      storageKey: key,
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.jwtPayload!.user_id,
    },
    select: { id: true, filename: true, contentType: true, size: true, createdAt: true },
  })

  res.status(201).json(doc)
}

/**
 * Entrega el archivo. **El permiso se comprueba en esta misma petición**, que es la ventaja de
 * servirlo desde el servicio en vez de exponer el directorio: no queda ninguna URL que siga
 * funcionando por su cuenta después, ni que se pueda reenviar a un tercero.
 */
export async function downloadDocument(req: Request, res: Response) {
  const doc = await prisma.claimDocument.findUnique({
    where: { id: req.params.docId as string },
  })
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }

  // El tenant se comprueba a través del reclamo: la fila del documento no lo lleva.
  const claim = await findClaimFor(req, doc.claimId)
  if (!claim) {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  if (!canAccess(req, claim)) {
    res.status(403).json({ error: 'Not allowed' })
    return
  }

  if (!doc.storageKey) {
    // Fila del diseño anterior, sin archivo propio detrás.
    res.status(410).json({ error: 'El archivo ya no está disponible' })
    return
  }

  let exists: boolean
  try {
    exists = await documentExists(doc.storageKey)
  } catch {
    res.status(500).json({ error: 'Referencia de archivo inválida' })
    return
  }
  if (!exists) {
    res.status(410).json({ error: 'El archivo ya no está disponible' })
    return
  }

  res.setHeader('Content-Type', doc.contentType ?? 'application/octet-stream')
  res.setHeader('Content-Length', String(doc.size))
  // `attachment` y no `inline`: un PDF o una imagen abiertos en el propio dominio del servicio
  // son superficie que no hace falta dar.
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/"/g, '')}"`)

  const stream = openDocument(doc.storageKey)
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo leer el archivo' })
    else res.destroy()
  })
  stream.pipe(res)
}

export async function removeDocument(req: Request, res: Response) {
  const doc = await prisma.claimDocument.findUnique({
    where: { id: req.params.docId as string },
  })
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }

  const claim = await findClaimFor(req, doc.claimId)
  if (!claim) {
    res.status(404).json({ error: 'Document not found' })
    return
  }

  // Borrar lo que uno subió, o ser admin. El dueño del *reclamo* no basta: si un admin adjuntó
  // un informe, el socio no debería poder hacerlo desaparecer.
  if (doc.uploadedBy !== req.jwtPayload!.user_id && !isAdmin(req)) {
    res.status(403).json({ error: 'Not allowed' })
    return
  }

  // Primero el archivo y después la fila: al revés, un fallo dejaría el archivo huérfano en el
  // disco sin nada que lo recuerde. Si falla el borrado, no se borra nada y se puede reintentar.
  if (doc.storageKey) {
    try {
      await deleteDocument(doc.storageKey)
    } catch {
      res.status(502).json({ error: 'No se pudo borrar el archivo' })
      return
    }
  }

  await prisma.claimDocument.delete({ where: { id: doc.id } })
  res.status(204).end()
}

export const MAX_UPLOAD_BYTES = MAX_FILE_BYTES
