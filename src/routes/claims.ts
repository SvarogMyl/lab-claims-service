import { Router } from 'express'
import multer from 'multer'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { uploadDocument as receiveFile } from '../middleware/upload.js'
import {
  uploadDocument,
  downloadDocument,
  removeDocument,
  MAX_UPLOAD_BYTES,
} from '../controllers/documentsController.js'
import {
  createClaim,
  listMyClaims,
  getClaim,
  trackClaim,
  addUserUpdate,
} from '../controllers/claimController.js'

const router = Router()

// Pública con tenant en query param
router.get('/track/:number', trackClaim)

// Crear reclamo (anónimo o autenticado)
router.post('/', optionalAuth, createClaim)

// Requiere autenticación
router.get('/', requireAuth, listMyClaims)
router.get('/:id', requireAuth, getClaim)
router.post('/:id/updates', requireAuth, addUserUpdate)

/**
 * Adjuntos. El envoltorio traduce los errores de multer a códigos legibles: sin él, un archivo
 * demasiado grande sale por el manejador de errores de Express como un 500 con HTML y quien
 * sube no sabe qué corregir.
 */
router.post(
  '/:id/documents',
  requireAuth,
  (req, res, next) => {
    receiveFile(req, res, (err) => {
      if (!err) {
        next()
        return
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: `El archivo supera el máximo de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
        })
        return
      }
      if (err instanceof Error && err.message === 'unsupported_type') {
        res.status(415).json({ error: 'Sólo se aceptan PDF, JPG, PNG o WebP' })
        return
      }
      res.status(400).json({ error: 'No se pudo procesar el archivo' })
    })
  },
  uploadDocument
)
router.get('/:id/documents/:docId', requireAuth, downloadDocument)
router.delete('/:id/documents/:docId', requireAuth, removeDocument)

export default router
