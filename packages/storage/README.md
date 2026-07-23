# @platform/storage

Provider-agnostic object storage (`StoragePort`) with one `S3StorageAdapter` serving both Cloudflare R2
(production) and MinIO (local dev/test), since both speak the S3 API. See
`docs/DOMAIN_MODEL_PHASE3.md` for the canonical storage-key convention (`buildStorageKey`) and the OCR seam
(`NotImplementedOcrProvider`).

Env vars: `STORAGE_PROVIDER` (`r2` | `minio`, default `minio`), then either
`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`/`R2_ENDPOINT` (optional) or
`MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`/`MINIO_BUCKET`.
