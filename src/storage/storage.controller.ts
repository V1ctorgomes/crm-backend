import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StorageAccessService } from './storage-access.service';
import { R2StreamService } from './r2-stream.service';

@Controller('storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class StorageController {
  constructor(
    private readonly access: StorageAccessService,
    private readonly stream: R2StreamService,
  ) {}

  /** Proxy autenticado para ficheiros no R2 (evita URLs públicas no browser). */
  @Get('file')
  async streamFile(
    @Req() req: { user: { userId: string } },
    @Query('u') encodedUrl: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const encoded = String(encodedUrl ?? '').trim();
    if (!encoded) {
      res.status(400).json({ message: 'Parâmetro u em falta.' });
      return;
    }
    const objectKey = await this.access.resolveObjectKeyFromEncodedUrl(encoded);
    await this.access.assertUserCanReadObjectKey(req.user.userId, objectKey);
    await this.stream.streamObjectByKey(objectKey, res);
  }
}
