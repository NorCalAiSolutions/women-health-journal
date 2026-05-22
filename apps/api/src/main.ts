import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/global-exception.filter";
import { rateLimitMiddleware } from "./common/rate-limit.middleware";
import { requestLoggingMiddleware } from "./common/request-logging.middleware";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(requestLoggingMiddleware());
  app.use(rateLimitMiddleware());
  const configuredOrigins = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  const devOrigins = process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"];
  app.enableCors({
    origin: [...new Set([...configuredOrigins, ...devOrigins])],
    credentials: true
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
