import { Prisma } from '@prisma/client';

export interface Actor {
  userId: string;
  ip?: string;
}

/** Writes an audit row. Call it with the same transaction client as the change it records. */
export function audit(
  db: Prisma.TransactionClient,
  actor: Partial<Actor>,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Prisma.InputJsonObject,
) {
  return db.auditLog.create({
    data: {
      actorId: actor.userId,
      ipAddress: actor.ip,
      action,
      entityType,
      entityId,
      metadata,
    },
  });
}
