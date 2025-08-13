const { TableClient } = require("@azure/data-tables");

const STORAGE = process.env.STORAGE_CONNECTION_STRING;
const SESSIONS_TABLE = "sessions";

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async function (context, req) {
  try {
    const client = TableClient.fromConnectionString(STORAGE, SESSIONS_TABLE);
    await client.createTable(); // no-op if exists

    // Generate code that doesn't exist yet
    let code = genCode();
    let exists = true;
    while (exists) {
      try {
        await client.createEntity({
          partitionKey: "session",
          rowKey: code,
          createdAt: Date.now()
        });
        exists = false;
      } catch (e) {
        // Conflict → try a new code
        code = genCode();
      }
    }
    context.res = { status: 200, jsonBody: { code } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, jsonBody: { error: "create_failed" } };
  }
};
