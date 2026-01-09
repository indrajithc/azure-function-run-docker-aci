const { app } = require("@azure/functions");
const {
  ContainerInstanceManagementClient,
} = require("@azure/arm-containerinstance");
const { DefaultAzureCredential } = require("@azure/identity");

const CONFIG = {
  LOCATION: "eastus",
  POLLING_INTERVAL_MS: 5000,
  MAX_POLLING_ATTEMPTS: 120, // 10 minutes
  CLEANUP_TIMEOUT_MS: 30000,
  CPU: 0.25,
  MEMORY_GB: 0.5,
  LOG_FETCH_LINES: 1000,
};

// Simple helper sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validateEnv() {
  const required = [
    "AZURE_SUBSCRIPTION_ID",
    "RESOURCE_GROUP",
    "ACI_IDENTITY_ID",
    "CONTAINER_REGISTRY_SERVER",
    "CONTAINER_IMAGE",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

// Generate unique container group name
function generateContainerGroupName() {
  return `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

// Check terminal state
const TERMINAL_STATES = ["Terminated", "Succeeded", "Failed"];
function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

// Create container group
async function createContainer(
  client,
  resourceGroup,
  groupName,
  containerName,
  context
) {
  context.log(`🚀 Creating container group: ${groupName}`);
  try {
    const poller = await client.containerGroups.beginCreateOrUpdate(
      resourceGroup,
      groupName,
      {
        location: CONFIG.LOCATION,
        osType: "Linux",
        identity: {
          type: "UserAssigned",
          userAssignedIdentities: {
            [process.env.ACI_IDENTITY_ID]: {},
          },
        },
        containers: [
          {
            name: containerName,
            image: process.env.CONTAINER_IMAGE,
            resources: {
              requests: { cpu: CONFIG.CPU, memoryInGB: CONFIG.MEMORY_GB },
            },
            environmentVariables: [
              {
                name: "AZURE_STORAGE_CONNECTION_STRING",
                secureValue: process.env.AZURE_STORAGE_CONNECTION_STRING,
              },
              {
                name: "AZURE_STORAGE_CONTAINER",
                value: process.env.AZURE_STORAGE_CONTAINER || "",
              },
              {
                name: "NODE_ENV",
                value: "production",
              },
            ],
          },
        ],
        restartPolicy: "Never",
        imageRegistryCredentials: [
          {
            server: process.env.CONTAINER_REGISTRY_SERVER,
            identity: process.env.ACI_IDENTITY_ID,
          },
        ],
      }
    );

    await poller.pollUntilDone();
    context.log(`✅ Container group ${groupName} created`);
  } catch (err) {
    context.error("❌ Error creating container group:", err.message);
    throw err;
  }
}

// Wait for container to finish
async function waitForContainer(
  client,
  resourceGroup,
  groupName,
  context,
  containerName
) {
  context.log("⏳ Waiting for container to reach terminal state...");
  for (let i = 0; i < CONFIG.MAX_POLLING_ATTEMPTS; i++) {
    await sleep(CONFIG.POLLING_INTERVAL_MS);
    try {
      const group = await client.containerGroups.get(resourceGroup, groupName);
      const container = group.containers?.[0];
      const state = container?.instanceView?.currentState?.state || "Unknown";
      const exitCode = container?.instanceView?.currentState?.exitCode ?? null;
      context.log(
        `📊 State: ${state}${exitCode !== null ? ` | Exit: ${exitCode}` : ""}`
      );
      if (isTerminal(state)) {
        return { state, exitCode };
      }
    } catch (err) {
      context.warn(`⚠️ Unable to fetch container state: ${err.message}`);
    }
  }
  throw new Error("Container did not reach terminal state in time");
}

// Fetch logs
async function fetchLogs(
  client,
  resourceGroup,
  groupName,
  containerName,
  context
) {
  try {
    const logs = await client.containers.listLogs(
      resourceGroup,
      groupName,
      containerName,
      {
        tail: CONFIG.LOG_FETCH_LINES,
      }
    );
    return logs?.content || "[NO LOGS]";
  } catch (err) {
    context.warn(`⚠️ Failed to fetch logs: ${err.message}`);
    return `[LOG FETCH FAILED]: ${err.message}`;
  }
}

// Cleanup
async function cleanup(client, resourceGroup, groupName, context) {
  try {
    const deletePoller = client.containerGroups.beginDelete(
      resourceGroup,
      groupName
    );
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Cleanup timeout")),
        CONFIG.CLEANUP_TIMEOUT_MS
      )
    );
    await Promise.race([deletePoller, timeout]);
    context.log(`🧹 Container group ${groupName} deleted`);
  } catch (err) {
    context.warn(`⚠️ Cleanup failed: ${err.message}`);
  }
}

// Main Azure Function
app.http("RunContainer", {
  methods: ["POST"],
  authLevel: "function",
  handler: async (req, context) => {
    validateEnv();
    const credential = new DefaultAzureCredential();
    const client = new ContainerInstanceManagementClient(
      credential,
      process.env.AZURE_SUBSCRIPTION_ID
    );
    const resourceGroup = process.env.RESOURCE_GROUP;
    const groupName = generateContainerGroupName();
    const containerName = "job-container";

    context.log("=======================================");
    context.log(`Starting container run: ${groupName}`);
    context.log("=======================================");

    try {
      await createContainer(
        client,
        resourceGroup,
        groupName,
        containerName,
        context
      );
      const result = await waitForContainer(
        client,
        resourceGroup,
        groupName,
        context,
        containerName
      );
      const logs = await fetchLogs(
        client,
        resourceGroup,
        groupName,
        containerName,
        context
      );
      console.log("===== CONTAINER LOGS =====");
      console.log(logs);
      console.log("===== END OF LOGS =====");
      await cleanup(client, resourceGroup, groupName, context);

      context.log("=======================================");
      context.log(`✅ Container finished | Exit: ${result.exitCode}`);
      context.log("=======================================");

      return {
        status: result.exitCode === 0 ? 200 : 500,
        jsonBody: {
          success: result.exitCode === 0,
          state: result.state,
          exitCode: result.exitCode,
          logs,
        },
      };
    } catch (err) {
      context.error("❌ Critical error:", err.message);
      await cleanup(client, resourceGroup, groupName, context);
      return {
        status: 500,
        jsonBody: { success: false, message: err.message },
      };
    }
  },
});
