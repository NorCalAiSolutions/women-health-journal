import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JournalCreateSchema } from "@whjc/shared";
import { parseZod } from "../../common/parse-zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JournalService } from "./journal.service";

@Controller("journal")
@UseGuards(JwtAuthGuard)
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post()
  create(@CurrentUser("sub") userId: string, @Body() body: unknown) {
    const input = parseZod(JournalCreateSchema, body);
    return this.journalService.create(userId, input).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unable to save journal entry.";
      throw new BadRequestException(message);
    });
  }

  @Get("timeline")
  timeline(@CurrentUser("sub") userId: string, @Query("range") range = "90") {
    return this.journalService.timeline(userId, Number(range));
  }

  @Get("insights")
  insights(@CurrentUser("sub") userId: string) {
    return this.journalService.insights(userId);
  }

  @Get(":id")
  getOne(@CurrentUser("sub") userId: string, @Param("id") id: string) {
    return this.journalService.getOne(userId, id);
  }
}
