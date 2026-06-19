import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
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

export default router
