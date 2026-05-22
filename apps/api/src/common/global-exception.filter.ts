import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { requestDurationMs, requestId } from "./request-logging.middleware";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const requestIdValue = requestId(req);
    const message = this.safeMessage(statusCode, errorResponse, exception);
    const errorName = exception instanceof Error ? exception.name : "UnknownError";

    const logPayload = {
      event: "http_request_failed",
      requestId: requestIdValue,
      method: req.method,
      path: req.path,
      statusCode,
      durationMs: requestDurationMs(req),
      errorName,
      errorMessage: exception instanceof Error ? exception.message : String(exception)
    };

    if (statusCode >= 500) {
      this.logger.error(JSON.stringify(logPayload), exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    res.setHeader("X-Request-ID", requestIdValue);
    res.status(statusCode).json({
      statusCode,
      error: this.errorLabel(statusCode, errorResponse),
      message,
      requestId: requestIdValue,
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }

  private safeMessage(statusCode: number, response: unknown, exception: unknown) {
    if (statusCode >= 500) {
      return "Internal server error";
    }

    if (typeof response === "string") {
      return response;
    }

    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === "string" || Array.isArray(message)) {
        return message;
      }
    }

    return exception instanceof Error ? exception.message : "Request failed";
  }

  private errorLabel(statusCode: number, response: unknown) {
    if (response && typeof response === "object" && "error" in response) {
      const error = (response as { error?: unknown }).error;
      if (typeof error === "string") return error;
    }
    if (statusCode === 400) return "Bad Request";
    if (statusCode === 401) return "Unauthorized";
    if (statusCode === 403) return "Forbidden";
    if (statusCode === 404) return "Not Found";
    if (statusCode === 429) return "Too Many Requests";
    return statusCode >= 500 ? "Internal Server Error" : "Request Failed";
  }
}
