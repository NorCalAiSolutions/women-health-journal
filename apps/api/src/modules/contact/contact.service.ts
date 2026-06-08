import { Injectable } from "@nestjs/common";
import { EmailService } from "../../common/email.service";
import { ContactRequestInput } from "./contact.schemas";

@Injectable()
export class ContactService {
  constructor(private readonly email: EmailService) {}

  async submit(input: ContactRequestInput) {
    await this.email.sendContactRequest(input);
    return { ok: true };
  }
}
