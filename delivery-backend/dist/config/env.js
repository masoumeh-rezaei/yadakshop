"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`Missing required environment variable: ${name}`);
    return value;
};
exports.env = {
    port: Number(process.env.PORT || 3000),
    dbHost: required('DB_HOST'),
    dbPort: Number(process.env.DB_PORT || 3306),
    dbUser: required('DB_USER'),
    dbPassword: process.env.DB_PASSWORD || '',
    dbName: required('DB_NAME'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
};
if (exports.env.jwtSecret.length < 32)
    throw new Error('JWT_SECRET must be at least 32 characters long');
