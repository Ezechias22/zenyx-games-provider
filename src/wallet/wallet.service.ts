import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, TxStatus, TxType } from '@prisma/client';
import { sha256Hex } from '../common/security/crypto.util';

function toDecimalString(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Invalid amount');
  // Avoid float rounding surprises: keep as string with 8 decimals
  return n.toFixed(8);
}

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  private async getOrCreatePlayer(operatorId: string, playerExternalId: string) {
    return this.prisma.player.upsert({
      where: { operatorId_externalId: { operatorId, externalId: playerExternalId } },
      update: {},
      create: { operatorId, externalId: playerExternalId },
    });
  }

  private async getOrCreateWallet(operatorId: string, playerId: string, currency: string) {
    return this.prisma.wallet.upsert({
      where: { playerId_currency: { playerId, currency } },
      update: {},
      create: { operatorId, playerId, currency, balance: '0' },
    });
  }

  async getBalance(operatorId: string, playerExternalId: string, currency: string) {
    const player = await this.getOrCreatePlayer(operatorId, playerExternalId);
    const wallet = await this.getOrCreateWallet(operatorId, player.id, currency);
    return { playerExternalId, currency, balance: wallet.balance.toString() };
  }

  private async handleIdempotency(operatorId: string, key: string | undefined, endpoint: string, requestObj: any) {
    if (!key) return null;
    const requestHash = sha256Hex(JSON.stringify(requestObj));
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { operatorId_key: { operatorId, key } },
    });
    if (existing) {
      if (existing.endpoint !== endpoint || existing.requestHash !== requestHash) {
        throw new BadRequestException('Idempotency key conflict');
      }
      return JSON.parse(existing.response);
    }
    return { _create: { operatorId, key, endpoint, requestHash } };
  }

  async debit(
    operatorId: string,
    playerExternalId: string,
    currency: string,
    amount: number,
    opts: { idempotencyKey?: string; referenceId?: string; meta?: Record<string, unknown> } = {},
  ) {
    const idem = await this.handleIdempotency(operatorId, opts.idempotencyKey, 'wallet/debit', {
      playerExternalId,
      currency,
      amount,
      referenceId: opts.referenceId,
      meta: opts.meta,
    });
    if (idem && !idem._create) return idem; // replay

    const amt = toDecimalString(amount);
    const player = await this.getOrCreatePlayer(operatorId, playerExternalId);

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.upsert({
        where: { playerId_currency: { playerId: player.id, currency } },
        update: {},
        create: { operatorId, playerId: player.id, currency, balance: '0' },
      });

      const newBalance = (BigInt(Math.round(parseFloat(wallet.balance.toString()) * 1e8)) - BigInt(Math.round(amount * 1e8)));
      if (newBalance < 0n) throw new BadRequestException('Fonds insuffisants');

      const t = await tx.transaction.create({
        data: {
          operatorId,
          playerId: player.id,
          walletId: wallet.id,
          currency,
          type: TxType.DEBIT,
          status: TxStatus.PENDING,
          amount: amt,
          referenceId: opts.referenceId,
          idempotencyKey: opts.idempotencyKey,
          meta: JSON.stringify(opts.meta || {}),
        },
      });

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: (Number(newBalance) / 1e8).toFixed(8) },
      });

      const applied = await tx.transaction.update({
        where: { id: t.id },
        data: { status: TxStatus.APPLIED, appliedAt: new Date() },
      });

      return { transactionId: applied.id, playerExternalId, currency, balance: updated.balance.toString() };
    });

    if (idem && idem._create) {
      await this.prisma.idempotencyKey.create({ data: { ...idem._create, response: JSON.stringify(result) } });
    }
    return result;
  }

  async credit(
    operatorId: string,
    playerExternalId: string,
    currency: string,
    amount: number,
    opts: { idempotencyKey?: string; referenceId?: string; meta?: Record<string, unknown> } = {},
  ) {
    const idem = await this.handleIdempotency(operatorId, opts.idempotencyKey, 'wallet/credit', {
      playerExternalId,
      currency,
      amount,
      referenceId: opts.referenceId,
      meta: opts.meta,
    });
    if (idem && !idem._create) return idem; // replay

    const amt = toDecimalString(amount);
    const player = await this.getOrCreatePlayer(operatorId, playerExternalId);

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.upsert({
        where: { playerId_currency: { playerId: player.id, currency } },
        update: {},
        create: { operatorId, playerId: player.id, currency, balance: '0' },
      });

      const newBalance = (BigInt(Math.round(parseFloat(wallet.balance.toString()) * 1e8)) + BigInt(Math.round(amount * 1e8)));

      const t = await tx.transaction.create({
        data: {
          operatorId,
          playerId: player.id,
          walletId: wallet.id,
          currency,
          type: TxType.CREDIT,
          status: TxStatus.PENDING,
          amount: amt,
          referenceId: opts.referenceId,
          idempotencyKey: opts.idempotencyKey,
          meta: JSON.stringify(opts.meta || {}),
        },
      });

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: (Number(newBalance) / 1e8).toFixed(8) },
      });

      const applied = await tx.transaction.update({
        where: { id: t.id },
        data: { status: TxStatus.APPLIED, appliedAt: new Date() },
      });

      return { transactionId: applied.id, playerExternalId, currency, balance: updated.balance.toString() };
    });

    if (idem && idem._create) {
      await this.prisma.idempotencyKey.create({ data: { ...idem._create, response: JSON.stringify(result) } });
    }
    return result;
  }

  async rollback(operatorId: string, transactionId: string, idempotencyKey?: string) {
    const idem = await this.handleIdempotency(operatorId, idempotencyKey, 'wallet/rollback', { transactionId });
    if (idem && !idem._create) return idem;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const t = await tx.transaction.findFirst({ where: { id: transactionId, operatorId } });
      if (!t) throw new BadRequestException('Transaction not found');
      if (t.status === TxStatus.REVERSED) {
        const wallet = await tx.wallet.findUnique({ where: { id: t.walletId } });
        return { rolledBack: true, transactionId: t.id, balance: wallet?.balance.toString() || '0' };
      }
      if (t.status !== TxStatus.APPLIED) throw new BadRequestException('Transaction not applied');

      const wallet = await tx.wallet.findUnique({ where: { id: t.walletId } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      const bal = BigInt(Math.round(parseFloat(wallet.balance.toString()) * 1e8));
      const amt = BigInt(Math.round(parseFloat(t.amount.toString()) * 1e8));
      const newBal = t.type === TxType.DEBIT ? (bal + amt) : (bal - amt);
      if (newBal < 0n) throw new BadRequestException('Invalid rollback');

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: (Number(newBal) / 1e8).toFixed(8) } });
      await tx.transaction.update({ where: { id: t.id }, data: { status: TxStatus.REVERSED } });

      return { rolledBack: true, transactionId: t.id, balance: (Number(newBal) / 1e8).toFixed(8) };
    });

    if (idem && idem._create) {
      await this.prisma.idempotencyKey.create({ data: { ...idem._create, response: JSON.stringify(result) } });
    }
    return result;
  }
}
