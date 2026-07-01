import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jagit/shared";
import { AgentTemplatesService, type AgentTemplateBody } from "./agent-templates.service.js";

@ApiTags("Config")
@Controller("agent-templates")
export class AgentTemplatesController {
  constructor(private readonly svc: AgentTemplatesService) {}

  @Get()
  @ApiOperation({ summary: "List agent templates" })
  list() { return this.svc.list(); }

  @Post()
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Create an agent template" })
  create(@Body() body: AgentTemplateBody) { return this.svc.create(body); }

  @Put(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Update an agent template" })
  update(@Param("id") id: string, @Body() body: AgentTemplateBody) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Delete an agent template" })
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
