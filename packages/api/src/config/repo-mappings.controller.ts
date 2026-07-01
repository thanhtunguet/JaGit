import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jagit/shared";
import { RepoMappingsService, type RepoMappingBody } from "./repo-mappings.service.js";

@ApiTags("Config")
@Controller("repo-mappings")
export class RepoMappingsController {
  constructor(private readonly svc: RepoMappingsService) {}

  @Get()
  @ApiOperation({ summary: "List repo mappings" })
  list() { return this.svc.list(); }

  @Post()
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Create a repo mapping" })
  create(@Body() body: RepoMappingBody) { return this.svc.create(body); }

  @Put(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Update a repo mapping" })
  update(@Param("id") id: string, @Body() body: RepoMappingBody) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Delete a repo mapping" })
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
