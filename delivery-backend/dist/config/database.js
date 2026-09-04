"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const env_js_1 = require("./env.js");
const pool = promise_1.default.createPool({
    host: env_js_1.env.dbHost,
    port: env_js_1.env.dbPort,
    user: env_js_1.env.dbUser,
    password: env_js_1.env.dbPassword,
    database: env_js_1.env.dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
exports.default = pool;
