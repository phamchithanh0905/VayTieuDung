const sql = require('mssql/msnodesqlv8');
const config = {
  driver: 'msnodesqlv8',
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=QuanLyKhoanVay;Trusted_Connection=yes;'
};
// wait, maybe top level `connectionString` works?
async function test() {
    try {
        await sql.connect(config);
        console.log("Success with top-level connection string!");
        process.exit(0);
    } catch(err) {
        console.error("Top-level err:", err.message);
        
        try {
            const config2 = {
                server: 'localhost', // mssql strictly requires server in config for pool
                driver: 'msnodesqlv8',
                options: {
                    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=QuanLyKhoanVay;Trusted_Connection=yes;'
                }
            };
            await sql.connect(config2);
            console.log("Success with options.connectionString");
            process.exit(0);
        } catch(err2) {
             console.error("Options err:", err2.message);
             process.exit(1);
        }
    }
}
test();
