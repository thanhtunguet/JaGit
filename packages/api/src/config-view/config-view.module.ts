import { Module } from "@nestjs/common";
import { ConfigViewController } from "./config-view.controller.js";

@Module({ controllers: [ConfigViewController] })
export class ConfigViewModule {}
