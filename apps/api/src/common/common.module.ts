import { Global, Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service";
import { DatabaseService } from "./database.service";
import { EmailService } from "./email.service";

@Global()
@Module({
  providers: [DatabaseService, CryptoService, EmailService],
  exports: [DatabaseService, CryptoService, EmailService]
})
export class CommonModule {}
