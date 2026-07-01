import { Module } from "@nestjs/common";
import { SseController } from "./sse.controller.js";

@Module({ controllers: [SseController] })
export class SseModule {}
