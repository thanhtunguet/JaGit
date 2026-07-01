import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jagit/shared";
import { McpServersService } from "./mcp-servers.service.js";

@ApiTags("Config")
@Controller("mcp-servers")
export class McpServersController {
  constructor(private readonly svc: McpServersService) {}

  @Get()
  @ApiOperation({ summary: "List MCP server configurations" })
  list() {
    return this.svc.list();
  }

  @Post()
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Create an MCP server configuration" })
  create(@Body() body: unknown) {
    return this.svc.create(body);
  }

  @Put(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Update an MCP server configuration" })
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Delete an MCP server configuration" })
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
