import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportService } from "./export.service";

@Controller("exports")
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get("doctor.pdf")
  async doctorPdf(@CurrentUser("sub") userId: string, @Query("days") days = "90", @Res() res: Response) {
    const pdf = await this.exportService.generateDoctorPdf(userId, Number(days));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=health-journal-summary.pdf");
    res.end(pdf);
  }
}
