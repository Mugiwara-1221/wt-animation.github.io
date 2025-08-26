const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database = client.database("animationapp");
const container = database.container("sessions");

module.exports = async function (context, req) {
  try {
    const sessionId = crypto.randomUUID(); // generate unique session code
    const newSession = {
      id: sessionId,      // Cosmos DB needs `id` property
      locks: {},          // empty at first
      createdAt: new Date().toISOString()
    };

    // Save into Cosmos
    await container.items.create(newSession);

    context.res = {
      status: 201,
      body: newSession
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};
