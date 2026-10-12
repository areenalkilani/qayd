import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { permissions } from './policy';
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(12).max(128);
export const phone = z.string().trim().regex(/^\+?[0-9 ()-]{6,30}$/, 'Enter a valid phone number with your preferred prefix');
export const name = z.string().trim().min(2).max(160);
export const registerSchema = z.object({ officeName: name, fullName: name, email, phone, password, confirmPassword: password }).strict().refine(v => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const employeeSchema = z.object({ fullName: name, email, phone, role: z.enum(['LAWYER', 'ADMINISTRATIVE']), permissions: z.array(z.enum(permissions)).max(permissions.length).default([]) }).strict();
export const employeeCreateSchema = employeeSchema.extend({ password, confirmPassword: password }).strict().refine(v => v.password === v.confirmPassword, 'Passwords do not match');
export const employeeUpdateSchema = z.object({ role: z.enum(['LAWYER', 'ADMINISTRATIVE']), status: z.enum(['ACTIVE', 'DISABLED']), permissions: z.array(z.enum(permissions)).max(permissions.length) }).strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).strict();
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), search: z.string().trim().max(100).default('') });
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException({ message: 'Invalid input', fields: result.error.issues.map(x => ({ field: x.path.join('.'), message: x.message })) });
  return result.data;
}
