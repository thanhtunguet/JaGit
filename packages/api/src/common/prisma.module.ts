import { Global, Module, Injectable, OnModuleDestroy } from "@nestjs/common";
import { prisma } from "@jigit/shared";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client = prisma;

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
