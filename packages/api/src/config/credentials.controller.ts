import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jagit/shared";
import { CredentialsService, type CredentialBody } from "./credentials.service.js";

@ApiTags("Config")
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly svc: CredentialsService) {}

  @Get()
  @ApiOperation({ summary: "List credentials (secrets redacted)" })
  list() { return this.svc.list(); }

  @Post()
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Create a credential" })
  create(@Body() body: CredentialBody) { return this.svc.create(body); }

  @Patch(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Update a credential (blank secret keeps existing)" })
  update(@Param("id") id: string, @Body() body: Omit<CredentialBody, "kind">) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Delete a credential" })
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
