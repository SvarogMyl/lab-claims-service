import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import {
  adminListClaims,
  adminGetClaim,
  adminUpdateStatus,
  adminAddUpdate,
  adminGetStats,
} from '../controllers/claimController.js'

const router = Router()

router.use(requireAdmin)

router.get('/claims/stats', adminGetStats)
router.get('/claims', adminListClaims)
router.get('/claims/:id', adminGetClaim)
router.patch('/claims/:id/status', adminUpdateStatus)
router.post('/claims/:id/updates', adminAddUpdate)

export default router
