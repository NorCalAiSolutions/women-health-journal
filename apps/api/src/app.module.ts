import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { JournalModule } from "./modules/journal/journal.module";
import { AiModule } from "./modules/ai/ai.module";
import { PatternsModule } from "./modules/patterns/patterns.module";
import { SafetyModule } from "./modules/safety/safety.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ExportModule } from "./modules/export/export.module";
import { CommonModule } from "./common/common.module";
import { CycleModule } from "./modules/cycle/cycle.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "..", "..", ".env")]
    }),
    CommonModule,
    AuthModule,
    AiModule,
    PatternsModule,
    SafetyModule,
    JournalModule,
    CycleModule,
    ExportModule
  ],
  providers: []
})
export class AppModule {}
