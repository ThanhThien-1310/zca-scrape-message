import { connectDb } from "../../store/db.js";

/** Read-only: verifies the connection and prints the shape of Zalo_CrawlMessage. Writes nothing. */
const pool = await connectDb();
try {
    const who = await pool.request().query("SELECT DB_NAME() AS db, SUSER_SNAME() AS login, @@VERSION AS version");
    console.log("connected:", who.recordset[0].db, "as", who.recordset[0].login);
    console.log(String(who.recordset[0].version).split("\n")[0]);

    const cols = await pool.request().query(`
        SELECT c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH AS len, c.IS_NULLABLE, c.COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = 'Zalo_CrawlMessage'
        ORDER BY c.ORDINAL_POSITION`);
    if (cols.recordset.length === 0) {
        console.log("\nTable Zalo_CrawlMessage NOT found in this database.");
    } else {
        console.log("\nZalo_CrawlMessage columns:");
        console.table(cols.recordset);

        const idx = await pool.request().query(`
            SELECT i.name, i.is_unique, i.is_primary_key,
                   STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS cols
            FROM sys.indexes i
            JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE i.object_id = OBJECT_ID('Zalo_CrawlMessage')
            GROUP BY i.name, i.is_unique, i.is_primary_key`);
        console.log("indexes:");
        console.table(idx.recordset);

        const cnt = await pool.request().query("SELECT COUNT(*) AS n FROM Zalo_CrawlMessage");
        console.log("existing rows:", cnt.recordset[0].n);
    }
} finally {
    await pool.close();
}
