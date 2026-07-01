import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  BadRequestException,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiParam } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { UsageService } from "./usage.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { MAX_UPLOAD_SIZE } from "./types.js";
import { loadConfig } from "@jagit/shared";

@ApiTags("Usage")
@Controller("usage")
export class UsageController {
  constructor(private readonly svc: UsageService) {}

  @Get("users")
  @ApiOperation({ summary: "List all users who have uploaded usage data" })
  @ApiResponse({ status: 200, description: "Array of users" })
  async listUsers() {
    return this.svc.listUsers();
  }

  @Get("users/:username")
  @ApiOperation({ summary: "Get a user's uploads (latest first)" })
  @ApiParam({ name: "username", description: "User name" })
  @ApiResponse({ status: 200, description: "Array of uploads" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getUserUploads(@Param("username") username: string) {
    return this.svc.getUserUploads(username);
  }

  @Get("users/:username/latest")
  @ApiOperation({ summary: "Get the most recent upload for a user" })
  @ApiParam({ name: "username", description: "User name" })
  @ApiResponse({ status: 200, description: "Latest upload data" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getLatestUpload(@Param("username") username: string) {
    const upload = await this.svc.getLatestUpload(username);
    if (!upload) return { data: null };
    return upload;
  }

  @Post("upload")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Upload a ZIP of CSV usage data" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        username: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Upload processed" })
  @ApiResponse({ status: 400, description: "Invalid ZIP or CSV" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async upload(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException("Missing file");

    const usernameField = data.fields["username"];
    const username =
      usernameField && !Array.isArray(usernameField) && usernameField.type === "field"
        ? String(usernameField.value)
        : "unknown";
    const buffer = await data.toBuffer();

    if (buffer.length > MAX_UPLOAD_SIZE) {
      throw new BadRequestException("File too large (max 50MB)");
    }

    return this.svc.uploadUsageData(username, buffer);
  }

  @Delete("users/:username")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Delete a user and all their uploads" })
  @ApiParam({ name: "username", description: "User name" })
  @ApiResponse({ status: 200, description: "User deleted" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async deleteUser(@Param("username") username: string) {
    return this.svc.deleteUser(username);
  }
}
