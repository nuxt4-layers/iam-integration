import { randomBytes, randomUUID } from 'node:crypto'

/** A fresh correlation identifier, for calls that do not continue a request. */
export function newCorrelationId(): string {
  return randomUUID()
}

/** A lower-case UUIDv7 (RFC 9562), as Identity's identifiers are. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(now, 0, 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
