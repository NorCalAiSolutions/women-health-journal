import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      service: "Women’s Health Journal Companion API",
      status: "ok"
    };
  }

  @Get("health")
  health() {
    return {
      status: "ok"
    };
  }
}
