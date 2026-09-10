import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import { createReadStream } from 'fs'

/**
 * Documentos privados en disco, en el mismo esquema que `prestatrack-uploads`: un volumen
 * Docker con nombre montado en el contenedor, no un bucket.
 *
 * **Gemelo de `lab-benefits-service/src/lib/storage.ts`.** Está duplicado y no extraído a un
 * paquete común porque los servicios del ecosistema se despliegan y versionan por separado, y
 * hoy son dos: montar la infraestructura de un paquete compartido para ~100 líneas costaría más
 * de lo que ahorra. Si aparece un tercero, ahí sí toca extraerlo.
 *
 * **La diferencia deliberada con PrestaTrack** está en la puerta, no en el almacén. Allá los
 * archivos se sirven con `express.static` en `/uploads` **sin autenticación**, apoyándose en que
 * la URL lleva un uuid no adivinable; para fotos de los objetos que uno mismo presta es una
 * decisión defendible y está documentada como tal. Acá se guardan documentos de socios de un
 * sindicato —y la afiliación sindical es dato sensible—, así que nada se sirve estáticamente:
 * cada descarga pasa por un endpoint que comprueba quién pide antes de entregar un byte.
 */

const DOCS_ROOT = process.env.DOCS_DIR || path.join(process.cwd(), 'documentos')

export const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Lo que se acepta subir. Es una **allowlist de tipo declarado**, no una garantía del contenido:
 * el `Content-Type` lo manda el cliente. Sirve para cerrar la puerta a lo obvio, no para confiar.
 */
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

/** En disco no hay credenciales que faltar: alcanza con que el directorio se pueda escribir. */
export const STORAGE_CONFIGURED = true

/**
 * `sindicato_demo/claims/<claimId>/<uuid>.pdf`
 *
 * El tenant va **primero y siempre**: es lo que permite razonar sobre el aislamiento mirando la
 * ruta, y lo que haría separable el directorio de un cliente si algún día se van a su propio
 * servidor.
 */
export function buildKey(
  tenantSlug: string,
  claimId: string,
  originalName: string,
  contentType: string
): string {
  const ext = ALLOWED_MIME[contentType] ?? path.extname(originalName).toLowerCase() ?? ''
  return `${tenantSlug}/claims/${claimId}/${randomUUID()}${ext}`
}

/**
 * Traduce una clave a una ruta absoluta **y comprueba que no se salga de `DOCS_ROOT`**.
 *
 * Hoy las claves las construye `buildKey` con un uuid, así que no hay entrada del usuario en
 * ellas; la comprobación está igual porque el día que una clave venga de la base de datos —y ya
 * viene: `storageKey` se lee de una fila— un `../` guardado por error o a propósito dejaría de
 * ser inofensivo. Es barato y no depende de que nadie recuerde esto después.
 */
function resolveKey(key: string): string {
  const full = path.resolve(DOCS_ROOT, key)
  const root = path.resolve(DOCS_ROOT)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('invalid_key')
  }
  return full
}

export async function putDocument(key: string, body: Buffer): Promise<void> {
  const full = resolveKey(key)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, body)
}

/** Stream para entregar el archivo. El permiso ya se comprobó en el controlador. */
export function openDocument(key: string) {
  return createReadStream(resolveKey(key))
}

export async function documentExists(key: string): Promise<boolean> {
  // `resolveKey` fuera del `try` a propósito: una clave que se sale del root es un dato
  // corrupto y tiene que propagarse, no confundirse con "el archivo no está". Si se tragara
  // aquí, el llamador respondería "ya no está disponible" a algo que en realidad es un
  // problema de integridad que nadie llegaría a ver.
  const full = resolveKey(key)
  try {
    await fs.access(full)
    return true
  } catch {
    return false
  }
}

export async function deleteDocument(key: string): Promise<void> {
  try {
    await fs.unlink(resolveKey(key))
  } catch (err) {
    // Que el archivo ya no esté no es un fallo del borrado: el objetivo era que no exista.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
