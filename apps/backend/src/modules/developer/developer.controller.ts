import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getSharedRedisConnection } from '@platform/event-bus';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

function getGitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function getPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

// Computed once at module load, not per-request — neither changes while the process is running.
const GIT_SHA = getGitSha();
const PACKAGE_VERSION = getPackageVersion();

/**
 * Doc 30's real, shippable surface this pass — see docs/DOMAIN_MODEL_PHASE8.md. Everything else
 * doc 30 asks for (DeveloperProfile/Environment/BuildArtifact/Release/Deployment/PipelineRun,
 * `POST /developer/generate`, `GET /developer/releases`) is deferred: there's real CI in this
 * repo (`.github/workflows/ci.yml` — lint/typecheck/test) but no CD stage, so there's nothing
 * real to attach deployment/release/pipeline-run tracking to.
 */
@ApiTags('developer')
@Controller('developer')
export class DeveloperController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    let dbOk = false;
    let redisOk = false;
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    try {
      const pong = await getSharedRedisConnection().ping();
      redisOk = pong === 'PONG';
    } catch {
      redisOk = false;
    }

    const status = dbOk && redisOk ? 'ok' : 'degraded';
    const body = {
      status,
      database: dbOk ? 'ok' : 'unreachable',
      redis: redisOk ? 'ok' : 'unreachable',
    };
    if (status !== 'ok') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  @UseGuards(JwtAuthGuard)
  @Get('version')
  version() {
    return { version: PACKAGE_VERSION, gitSha: GIT_SHA };
  }
}
