import { BadRequestException, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CycleService } from "./cycle.service";

@Controller("cycle")
@UseGuards(JwtAuthGuard)
export class CycleController {
  constructor(private readonly cycle: CycleService) {}

  @Post("import")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const allowed = ["text/plain", "text/csv", "application/csv", "application/pdf", "application/vnd.ms-excel"];
        const extensionAllowed = /\.(txt|csv|pdf)$/i.test(file.originalname);
        if (allowed.includes(file.mimetype) || extensionAllowed) {
          callback(null, true);
          return;
        }
        callback(new BadRequestException("Upload a TXT, CSV, or PDF cycle summary."), false);
      }
    })
  )
  import(@CurrentUser("sub") userId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Choose a TXT, CSV, or PDF cycle summary to import.");
    }
    return this.cycle.importFile(userId, file);
  }

  @Get("summary")
  summary(@CurrentUser("sub") userId: string) {
    return this.cycle.summary(userId);
  }
}
