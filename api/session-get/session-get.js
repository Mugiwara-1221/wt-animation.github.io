const { TableClient, odata } = require("@azure/data-tables");

const STORAGE = process.env.STORAGE_CONNECTION_STRING;
const SESSIONS_TABLE = "sessions";
const LOCKS_TABLE = "locks";

module.exports = async function (context, req) {
  const code = context.bindingData.code;
  try {
    const sessions = TableClient.fromConnectionString(STORAGE, SESSIONS_TABLE);
    const locks = TableClient.fromConnectionString(STORAGE, LOCKS_TABLE);
    await sessions.createTable();
    await locks.createTable();

    // check session exists
    let exists = true;
    try {
      await sessions.getEntity("session", code);
    } catch {
      exists = false;
    }

    const outLocks = {};
    if (exists) {
      const query = locks.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${code}` } });
      for await (const e of query) outLocks[e.rowKey] = true;
    }

    context.res = { status: 200, jsonBody: { exists, locks: outLocks } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, jsonBody: { error: "get_failed" } };
  }
};
