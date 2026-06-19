import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client'

export const register = new Registry()

collectDefaultMetrics({ register })

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
})

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
  registers: [register],
})
