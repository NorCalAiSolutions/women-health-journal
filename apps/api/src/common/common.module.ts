import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { CryptoService } from "./crypto.service";
import { DatabaseService } from "./database.service";
import { EmailService } from "./email.service";

@Global()
@Module({
  providers: [DatabaseService, CryptoService, EmailService, AuditService],
  exports: [DatabaseService, CryptoService, EmailService, AuditService]
})
export class CommonModule {}
