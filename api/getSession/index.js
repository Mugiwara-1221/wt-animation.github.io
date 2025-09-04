import { CosmosClient } from "@azure/cosmos";

const SESSIONS_TABLE = "sessions"; // your collection name

export default async function (context, req) {
  const id = req.query.id;
  if (!id) {
    context.res = { status: 400, body: { error: "Missing id" } };
    return;
  }

  try {
    // ⚡ Connect to Cosmos
    const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    const database = client.database(process.env.COSMOS_DATABASE);
    const container = database.container(SESSIONS_TABLE);

    // Query for the session by id
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: id }],
      })
      .fetchAll();

    if (!resources.length) {
      context.res = { status: 404, body: { error: "Session not found" } };
      return;
    }

    const session = resources[0];

    context.res = {
      status: 200,
      body: {
        id: session.id,
        createdAt: session.createdAt,
        memberIds: session.memberIds || [],
      },
    };
  } catch (err) {
    context.log.error("getSession failed:", err.message);
    context.res = { status: 500, body: { error: "Server error" } };
  }
}
