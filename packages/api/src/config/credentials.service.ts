import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import {
  validateCredential,
  mergeSecrets,
  credentialSecretKeys,
  decrypt,
  type CredentialKind,
} from "@jigit/shared";

export interface CredentialBody {
  kind: CredentialKind;
  name: string;
  meta: Record<string, string>;
  secrets: Record<string, string>;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyB64: string,
  ) {}

  async list() {
    const rows = await this.prisma.client.credential.findMany();
    return rows.map(({ id, kind, name, meta }: any) => ({
      id,
      kind,
      name,
      meta: meta as Record<string, string>,
      secretKeys: credentialSecretKeys(kind as CredentialKind),
    }));
  }

  async create(body: CredentialBody) {
    try {
      validateCredential(body.kind, { meta: body.meta, secrets: body.secrets });
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    const encrypted = mergeSecrets(null, body.secrets, this.keyB64);
    return this.prisma.client.credential.create({
      data: {
        kind: body.kind,
        name: body.name,
        meta: body.meta,
        secrets: { encrypted },
      },
    }).then(({ id }: any) => ({ id }));
  }

  async update(id: string, body: Omit<CredentialBody, "kind">) {
    const existing = await this.prisma.client.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Credential ${id} not found`);

    const kind = existing.kind as CredentialKind;
    const existingSecrets = (existing.secrets as any)?.encrypted ?? null;

    // Merge first, then validate the merged result so blank fields keep existing
    const encrypted = mergeSecrets(existingSecrets, body.secrets, this.keyB64);
    try {
      const decrypted = JSON.parse(decrypt(encrypted, this.keyB64));
      validateCredential(kind, { meta: body.meta, secrets: decrypted });
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    return this.prisma.client.credential.update({
      where: { id },
      data: {
        name: body.name,
        meta: body.meta,
        secrets: { encrypted },
      },
    }).then(() => ({ updated: true }));
  }

  async remove(id: string) {
    const existing = await this.prisma.client.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Credential ${id} not found`);
    await this.prisma.client.credential.delete({ where: { id } });
    return { deleted: true };
  }
}
