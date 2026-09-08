"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const app_js_1 = __importDefault(require("./app.js"));
const env_js_1 = require("./config/env.js");
const realtime_js_1 = require("./realtime.js");
const httpServer = (0, node_http_1.createServer)(app_js_1.default);
(0, realtime_js_1.initializeRealtime)(httpServer);
httpServer.listen(env_js_1.env.port, () => {
    console.log(`Delivery API is running on port ${env_js_1.env.port}`);
});
