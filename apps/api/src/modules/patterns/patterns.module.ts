import { Module } from "@nestjs/common";
import { PatternService } from "./patterns.service";

@Module({
  providers: [PatternService],
  exports: [PatternService]
})
export class PatternsModule {}
