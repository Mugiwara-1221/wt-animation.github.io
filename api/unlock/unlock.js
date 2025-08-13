const { TableClient } = require("@azure/data-tables");

const STORAGE = process.env.STORAGE_CONNECTION_STRING;
const LOCKS_TABLE = "locks";

module.exports = async function (context, req) {
  const code = context.bindingData.code;
  const character = context.bindingData.character;
  try {
    const locks = TableClient.fromConnectionString(STORAGE, LOCKS_TABLE);
    await locks.createTable();
    await locks.deleteEntity(code, character); // ignore if missing
    context.res = { status: 200, jsonBody: { ok: true } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, jsonBody: { error: "unlock_failed" } };
  }
};
