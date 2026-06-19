import { Request, Response, NextFunction } from 'express'
import { httpRequestsTotal, httpRequestDuration } from '../lib/metrics.js'

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  const route = req.route?.path ?? req.path

  res.on('finish', () => {
    const duration = Date.now() - start
    const labels = { method: req.method, route }
    httpRequestsTotal.inc({ ...labels, status_code: String(res.statusCode) })
    httpRequestDuration.observe(labels, duration)
  })

  next()
}
