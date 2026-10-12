import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { z } from 'zod';
import { Db } from './db';
import { AuthRequest, OfficePermission } from './security';
import { requireOffice } from './policy';
import { pageSchema, parse } from './validation';
import { PrivateStorage, validateFile } from './storage';

@ApiTags('Private case files') @Controller('files')
export class FilesController {
  constructor(@Inject(Db) private db: Db, @Inject(PrivateStorage) private storage: PrivateStorage) {}
  @OfficePermission('cases.read') @Get()
  async list(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema.extend({ caseId: z.string().uuid().optional() }), query);
    const where = { officeId: requireOffice(req.user), ...(v.caseId ? { caseId: v.caseId } : {}), originalName: { contains: v.search, mode: 'insensitive' as const } };
    const [items, total] = await this.db.$transaction([this.db.caseAttachment.findMany({ where, select: { id: true, caseId: true, originalName: true, contentType: true, size: true, createdAt: true, uploadedBy: true, case: { select: { internalNumber: true } } }, skip: (v.page - 1) * 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }), this.db.caseAttachment.count({ where })]);
    return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('documents.manage') @Post('cases/:id')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }))
  async upload(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) caseId: string, @UploadedFile() file?: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    const officeId = requireOffice(req.user);
    if (!await this.db.legalCase.findFirst({ where: { id: caseId, officeId } })) throw new NotFoundException();
    if (!file) throw new BadRequestException('A file is required');
    // Browsers send UTF-8 names; multipart parsers may decode the header as Latin-1.
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (/^[\u0000-\u00ff]*$/.test(file.originalname) && !decodedName.includes('\ufffd')) file.originalname = decodedName;
    const type = validateFile(file);
    const storageKey = await this.storage.write(file.buffer, type.ext);
    try {
      return await this.db.$transaction(async tx => {
        const item = await tx.caseAttachment.create({ data: { officeId, caseId, originalName: file.originalname, storageKey, contentType: type.mime, size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), uploadedBy: req.user.id } });
        await tx.audit.create({ data: { officeId, actorId: req.user.id, action: 'DOCUMENT_UPLOADED', targetId: caseId, metadata: { attachmentId: item.id, size: file.size } } });
        return { id: item.id, originalName: item.originalName, size: item.size };
      });
    } catch (e) { await this.storage.remove(storageKey); throw e; }
  }
  @OfficePermission('cases.read') @Get(':id/download')
  async download(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const officeId = requireOffice(req.user); const item = await this.db.caseAttachment.findFirst({ where: { id, officeId } });
    if (!item) throw new NotFoundException(); const bytes = await this.storage.read(item.storageKey);
    await this.db.audit.create({ data: { officeId, actorId: req.user.id, action: 'DOCUMENT_DOWNLOADED', targetId: item.caseId, metadata: { attachmentId: id } } });
    res.setHeader('Content-Disposition', `attachment; filename="document.${item.storageKey.split('.').at(-1)}"; filename*=UTF-8''${encodeURIComponent(item.originalName).replace(/'/g, '%27')}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes, { type: item.contentType, length: bytes.length });
  }
  @OfficePermission('cases.read') @Post('download-selected')
  async selectedArchive(@Req() req: AuthRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const ids = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(), body).ids; const officeId = requireOffice(req.user);
    const items = await this.db.caseAttachment.findMany({ where: { officeId, id: { in: ids } }, orderBy: { createdAt: 'asc' } });
    if (items.length !== ids.length) throw new NotFoundException();
    if (items.reduce((sum, f) => sum + f.size, 0) > 25 * 1024 * 1024) throw new BadRequestException('Selected download is limited to 25 MB');
    const archive: Record<string, Uint8Array> = {}; for (const file of items) archive[`${file.id}-${file.originalName}`] = await this.storage.read(file.storageKey);
    const bytes = Buffer.from(zipSync(archive, { level: 0 })); await this.db.audit.create({ data: { officeId, actorId: req.user.id, action: 'DOCUMENTS_SELECTED_DOWNLOADED', targetId: 'MULTIPLE', metadata: { count: items.length } } });
    res.setHeader('Content-Disposition', 'attachment; filename="selected-case-files.zip"'); return new StreamableFile(bytes, { type: 'application/zip', length: bytes.length });
  }
  @OfficePermission('cases.read') @Get('cases/:id/archive')
  async archive(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) caseId: string, @Res({ passthrough: true }) res: Response) {
    const officeId = requireOffice(req.user);
    if (!await this.db.legalCase.findFirst({ where: { id: caseId, officeId } })) throw new NotFoundException();
    const items = await this.db.caseAttachment.findMany({ where: { officeId, caseId }, orderBy: { createdAt: 'asc' }, take: 101 });
    if (!items.length) throw new NotFoundException('No files');
    if (items.length > 100 || items.reduce((sum, f) => sum + f.size, 0) > 25 * 1024 * 1024) throw new BadRequestException('Bulk download is limited to 100 files and 25 MB; download files individually');
    const archive: Record<string, Uint8Array> = {};
    for (const file of items) archive[`${file.id}-${file.originalName}`] = await this.storage.read(file.storageKey);
    const bytes = Buffer.from(zipSync(archive, { level: 0 }));
    await this.db.audit.create({ data: { officeId, actorId: req.user.id, action: 'DOCUMENTS_BULK_DOWNLOADED', targetId: caseId, metadata: { count: items.length } } });
    res.setHeader('Content-Disposition', 'attachment; filename="case-files.zip"'); return new StreamableFile(bytes, { type: 'application/zip', length: bytes.length });
  }
}
