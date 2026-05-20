import { Global, Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service";
import { DatabaseService } from "./database.service";

@Global()
@Module({
  providers: [DatabaseService, CryptoService],
  exports: [DatabaseService, CryptoService]
})
export class CommonModule {}
