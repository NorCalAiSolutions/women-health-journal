import { Body, Controller, Post } from "@nestjs/common";
import { parseZod } from "../../common/parse-zod";
import { ContactRequestSchema } from "./contact.schemas";
import { ContactService } from "./contact.service";

@Controller("contact")
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  submit(@Body() body: unknown) {
    return this.contact.submit(parseZod(ContactRequestSchema, body));
  }
}
