-- Adjuntos de reclamos: del diseño "hay una URL" al de "lo entrega el servicio".
--
-- Sólo ADD y DROP NOT NULL: **nada se borra ni se reescribe**. `lab_db` es compartida por varios
-- servicios en el mismo schema `public` (ADR-006) y esta tabla existe desde el init, así que la
-- migración es deliberadamente aditiva — si hubiera filas cargadas a mano, sobreviven intactas.
--
-- `url` pasa a nullable porque las filas nuevas no tienen URL que guardar; se conserva la
-- columna por si algún adjunto viniera de fuera.

ALTER TABLE "claim_documents" ADD COLUMN "storage_key" VARCHAR(500);
ALTER TABLE "claim_documents" ADD COLUMN "content_type" VARCHAR(100);
ALTER TABLE "claim_documents" ALTER COLUMN "url" DROP NOT NULL;
