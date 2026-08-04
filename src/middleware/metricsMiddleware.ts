import { Request, Response, NextFunction } from 'express'
import { httpRequestsTotal, httpRequestDuration } from '../lib/metrics.js'

/**
 * Etiqueta única para todo lo que no matcheó ninguna ruta: 404s y, sobre todo, las sondas
 * automatizadas que buscan secretos (`/.env`, `/.aws/credentials`, `/.git/config`…). Sin esto
 * cada URL inventada crea una serie nueva y permanente en Prometheus, así que **cualquiera
 * desde afuera puede hacer crecer la cardinalidad a voluntad**.
 */
const UNMATCHED_ROUTE = '__unmatched__'

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()

  res.on('finish', () => {
    // La etiqueta se calcula **acá y no antes de `next()`**: este middleware está montado con
    // `app.use()`, o sea corre antes del router, y en ese momento `req.route` todavía no existe.
    // Al caer en `req.path` se guardaba la ruta cruda con los ids adentro
    // (`/api/v1/recurso/<uuid>`), así que **cada registro generaba su propia serie** y la
    // cardinalidad crecía con el uso real. Cuando la respuesta termina el router ya hizo match
    // y `req.route.path` trae el patrón (`/recurso/:id`).
    //
    // `req.baseUrl` hace falta porque `req.route.path` es relativo al router donde está montado:
    // sin él la etiqueta pierde el prefijo `/api/v1`.
    const route = req.route ? `${req.baseUrl}${req.route.path}` : UNMATCHED_ROUTE
    const duration = Date.now() - start
    const labels = { method: req.method, route }
    httpRequestsTotal.inc({ ...labels, status_code: String(res.statusCode) })
    httpRequestDuration.observe(labels, duration)
  })

  next()
}
