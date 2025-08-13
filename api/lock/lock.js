const { TableClient, odata } = require("@azure/data-tables");

const STORAGE = process.env.STORAGE_CONNECTION_STRING;
const LOCKS_TABLE = "locks";

module.exports = async function (context, req) {
  const code = context.bindingData.code;
  const { character, token } = req.body || {};

  if (!character || !token) {
    context.res = { status: 400, jsonBody: { error: "missing_character_or_token" } };
    return;
  }

  try {
    const locks = TableClient.fromConnectionString(STORAGE, LOCKS_TABLE);
    await locks.createTable();

    // Insert will fail if row already exists (atomic lock)
    try {
      await locks.createEntity({
        partitionKey: code,
        rowKey: character,
        token,
        lockedAt: Date.now()
      });
    } catch (e) {
      context.res = { status: 200, jsonBody: { ok: false, reason: "taken" } };
      return;
    }

    // Return updated locks
    const outLocks = {};
    const query = locks.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${code}` } });
    for await (const e of query) outLocks[e.rowKey] = true;

    context.res = { status: 200, jsonBody: { ok: true, locks: outLocks } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, jsonBody: { error: "lock_failed" } };
  }
};
