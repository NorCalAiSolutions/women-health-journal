import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { CycleController } from "./cycle.controller";
import { CycleService } from "./cycle.service";

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [CycleController],
  providers: [CycleService]
})
export class CycleModule {}
