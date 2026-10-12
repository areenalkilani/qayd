import { ApiBody } from '@nestjs/swagger';
// Shared API body documentation. Runtime validation remains the Zod schemas.
export function JsonBody(fields: Record<string, 'string' | 'boolean' | 'permissions'>, optional: string[] = []) {
  return ApiBody({ schema: { type: 'object', additionalProperties: false, required: Object.keys(fields).filter(x => !optional.includes(x)), properties: Object.fromEntries(Object.entries(fields).map(([key, type]) => [key, type === 'permissions' ? { type: 'array', items: { type: 'string' } } : { type, ...(key.toLowerCase().includes('password') ? { format: 'password', maxLength: 128 } : {}) }])) } });
}
