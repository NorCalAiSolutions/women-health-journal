import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { AuditService } from "../../common/audit.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportService } from "./export.service";

@Controller("exports")
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly audit: AuditService
  ) {}

  @Get("doctor.pdf")
  async doctorPdf(@CurrentUser("sub") userId: string, @Query("days") days = "90", @Req() req: Request, @Res() res: Response) {
    const pdf = await this.exportService.generateDoctorPdf(userId, Number(days), this.audit.contextFromRequest(req));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=health-journal-summary.pdf");
    res.end(pdf);
  }
}
