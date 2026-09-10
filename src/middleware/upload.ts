import multer from 'multer'
import { ALLOWED_MIME, MAX_FILE_BYTES } from '../lib/storage.js'

/**
 * En memoria y no en disco: el archivo va derecho a R2 y no llega a tocar el disco del
 * servidor. Con el tope de 10 MB de abajo, el costo en RAM está acotado.
 */
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) {
      cb(null, true)
      return
    }
    cb(new Error('unsupported_type'))
  },
}).single('file')
