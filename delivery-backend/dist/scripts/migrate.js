"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const promise_1 = __importDefault(require("mysql2/promise"));
const env_js_1 = require("../config/env.js");
const migrationsDirectory = (0, node_path_1.resolve)(process.cwd(), 'migrations');
const run = async () => {
    const files = (await (0, promises_1.readdir)(migrationsDirectory))
        .filter((file) => /^\d+_.+\.sql$/.test(file))
        .sort((left, right) => left.localeCompare(right));
    if (!files.length) {
        console.log('No migration files found.');
        return;
    }
    const connection = await promise_1.default.createConnection({
        host: env_js_1.env.dbHost,
        port: env_js_1.env.dbPort,
        user: env_js_1.env.dbUser,
        password: env_js_1.env.dbPassword,
        database: env_js_1.env.dbName,
        multipleStatements: true,
    });
    try {
        for (const file of files) {
            const sql = await (0, promises_1.readFile)((0, node_path_1.resolve)(migrationsDirectory, file), 'utf8');
            await connection.beginTransaction();
            try {
                await connection.query(sql);
                await connection.commit();
                console.log(`Applied ${file}`);
            }
            catch (error) {
                await connection.rollback();
                throw error;
            }
        }
        const [rows] = await connection.query('SELECT COUNT(*) AS count FROM saved_places');
        console.log(`Saved places ready: ${Number(rows[0]?.count ?? 0)}`);
    }
    finally {
        await connection.end();
    }
};
run().catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
