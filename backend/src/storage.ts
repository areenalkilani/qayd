import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export abstract class PrivateStorage {
  abstract write(bytes: Buffer, extension: string): Promise<string>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class LocalPrivateStorage extends PrivateStorage {
  private root = resolve(process.env.STORAGE_ROOT || './storage');
  private path(key: string) {
    if (!/^[a-f0-9-]{36}\.(pdf|png|jpg|webp)$/.test(key)) throw new BadRequestException('Invalid storage key');
    const target = resolve(this.root, key);
    if (!target.startsWith(this.root + sep)) throw new BadRequestException('Invalid storage path');
    return target;
  }
  async write(bytes: Buffer, extension: string) {
    const key = `${randomUUID()}.${extension}`; const target = this.path(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 }); return key;
  }
  read(key: string) { return readFile(this.path(key)); }
  async remove(key: string) { await unlink(this.path(key)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export function validateFile(file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
  if (!file.size || file.size > 10 * 1024 * 1024 || file.size !== file.buffer.length) throw new BadRequestException('File must be between 1 byte and 10 MB');
  if (/[\x00-\x1f/\\]/.test(file.originalname) || file.originalname.length > 180) throw new BadRequestException('Invalid filename');
  const bytes = file.buffer;
  let type: { mime: string; ext: string; extensions: string[] } | undefined;
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF'))) type = { mime: 'application/pdf', ext: 'pdf', extensions: ['pdf'] };
  else if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(12, 16).toString() === 'IHDR') type = { mime: 'image/png', ext: 'png', extensions: ['png'] };
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) type = { mime: 'image/jpeg', ext: 'jpg', extensions: ['jpg', 'jpeg'] };
  else if (bytes.length >= 16 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') type = { mime: 'image/webp', ext: 'webp', extensions: ['webp'] };
  const extension = file.originalname.split('.').at(-1)?.toLowerCase() || '';
  if (!type || !type.extensions.includes(extension) || file.mimetype !== type.mime) throw new BadRequestException('File extension, MIME type and content must match PDF, PNG, JPEG or WebP');
  return type;
}
