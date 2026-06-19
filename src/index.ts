import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { readFileSync } from 'fs'
import { register } from './lib/metrics.js'
import { metricsMiddleware } from './middleware/metricsMiddleware.js'
import claimsRoutes from './routes/claims.js'
import adminRoutes from './routes/admin.js'

const app = express()
const PORT = process.env.PORT ?? 3004

const openapiYaml = readFileSync(new URL('../openspec/openapi.yaml', import.meta.url), 'utf-8')

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(metricsMiddleware)

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'lab-claims-service' }))

app.get('/openapi.yaml', (_req, res) => {
  res.set('Content-Type', 'application/yaml')
  res.send(openapiYaml)
})

app.get('/docs', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>lab-claims-service — API Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url: "/openapi.yaml",
    dom_id: "#swagger-ui",
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout: "BaseLayout",
    deepLinking: true,
  })
</script>
</body>
</html>`)
})

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.send(await register.metrics())
})

app.use('/api/v1/claims', claimsRoutes)
app.use('/api/v1/admin', adminRoutes)

app.listen(PORT, () => {
  console.log(`[Server] Claims Service running on port ${PORT}`)
})
