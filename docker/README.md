# Docker

Contains container definitions for services that run server-side.

Note: `apps/desktop` (Electron) is a native desktop application and is **not**
containerized — there is intentionally no `desktop.Dockerfile`. Only
`apps/backend` (API, workers, scheduler) ships as a container image.
