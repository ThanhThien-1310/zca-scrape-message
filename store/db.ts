import sql from "mssql";

/** Reads DB_* settings from `.env` (never committed — see .gitignore) and opens a connection pool. */
export async function connectDb(): Promise<sql.ConnectionPool> {
    try {
        process.loadEnvFile();
    } catch {
        // no .env file — fall back to whatever is already in the environment
    }

    const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_ENCRYPT, DB_TRUST_CERT } = process.env;
    for (const [key, value] of Object.entries({ DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD })) {
        if (!value) throw new Error(`Missing ${key} in .env`);
    }

    return new sql.ConnectionPool({
        server: DB_SERVER!,
        port: DB_PORT ? Number(DB_PORT) : 1433,
        database: DB_NAME!,
        user: DB_USER!,
        password: DB_PASSWORD!,
        options: {
            encrypt: DB_ENCRYPT !== "false",
            trustServerCertificate: DB_TRUST_CERT === "true",
        },
        connectionTimeout: 15_000,
        requestTimeout: 30_000,
    }).connect();
}

export { sql };
