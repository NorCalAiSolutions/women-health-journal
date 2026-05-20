import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { PatternsModule } from "../patterns/patterns.module";
import { SafetyModule } from "../safety/safety.module";
import { JournalController } from "./journal.controller";
import { JournalService } from "./journal.service";

@Module({
  imports: [AuthModule, AiModule, PatternsModule, SafetyModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService]
})
export class JournalModule {}
