const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = client.database("animationapp");
const container = database.container("sessions");

module.exports = async function (context, req) {
  try {
    const { id } = req.body;
    if (!id) {
      context.res = { status: 400, body: { error: "Missing id" } };
      return;
    }
    const sessionId = crypto.randomUUID();

    const newSession = {
      id: sessionId,
      locks: {},
      createdAt: new Date().toISOString(),
      sessions: "default" // ✅ required for partition key
    };

    // Save into Cosmos
    await container.items.create(newSession);

    context.res = {
      status: 201,
      body: newSession
    };
  } catch (err) {
    context.log("Error creating session:", err);

    context.res = {
      status: 500,
      body: {
        message: "Error creating session",
        error: err.message,
        code: err.code,
        details: err.body || err.stack
      }
    };
  }
};
