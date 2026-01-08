const { app } = require("@azure/functions");
const {
  ContainerInstanceManagementClient,
} = require("@azure/arm-containerinstance");
const { DefaultAzureCredential } = require("@azure/identity");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const handler = async function async(request, context) {
  context.log(`Http function processed request for url "${request.url}"`);

  const name = request.query.get("name") || (await request.text()) || "world";

  const credential = new DefaultAzureCredential();
  const client = new ContainerInstanceManagementClient(
    credential,
    process.env.AZURE_SUBSCRIPTION_ID
  );

  const resourceGroup = process.env.RESOURCE_GROUP;
  const containerGroupName = `hello-${Date.now()}`;

  context.log("🚀 Starting container...");

  // 1️⃣ Start container
  await client.containerGroups.beginCreateOrUpdate(
    resourceGroup,
    containerGroupName,
    {
      location: "eastus",
      osType: "Linux",
      containers: [
        {
          name: "hello",
          image: process.env.CONTAINER_IMAGE,
          resources: {
            requests: {
              cpu: 0.25,
              memoryInGB: 0.5,
            },
          },
        },
      ],
      restartPolicy: "Never",
      imageRegistryCredentials: [
        {
          server: process.env.ACR_SERVER,
          username: process.env.ACR_USERNAME,
          password: process.env.ACR_PASSWORD,
        },
      ],
    }
  );

  // 2️⃣ Wait until container stops
  let state = "Running";
  while (state === "Running") {
    await sleep(2000);

    const group = await client.containerGroups.get(
      resourceGroup,
      containerGroupName
    );

    state = group.containers?.[0]?.instanceView?.currentState?.state;
    context.log(`⏳ Container state: ${state}`);
  }

  // 3️⃣ Fetch logs
  const logs = await client.containers.listLogs(
    resourceGroup,
    containerGroupName,
    "hello"
  );

  const output = logs.content || "No output";

  // 4️⃣ Delete container
  context.log("🧹 Cleaning up container...");
  await client.containerGroups.beginDelete(resourceGroup, containerGroupName);

  // 5️⃣ Return output
  context.res = {
    status: 200,
    body: {
      message: "Container executed successfully",
      output,
    },
  };
};

app.http("RunContainer", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler,
});
