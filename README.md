# 🚀 Azure Function → Run Docker Image (Hello World)

This repository demonstrates how to **call an Azure Function via HTTP**, which then **runs a pre-built Docker image using Azure Container Instances (ACI)**, captures the **container output (stdout)**, and **returns it as the API response**.

This pattern is useful for:

- Running short-lived jobs
- CLI-style workloads
- Dev/admin tools
- Containerized scripts triggered via API

---

## 🧠 Architecture Overview

```
Client (HTTP API call)
        ↓
Azure Function App (Node.js)
        ↓
Azure Container Instance (ACI)
        ↓
Run Docker Image
        ↓
Fetch Logs (stdout)
        ↓
Delete Container
        ↓
Return Output as API Response
```

---

## 📦 What This Repo Contains

- A **Hello World Docker image**
- Instructions to **build & push the image**
- An **Azure Function** that:

  - Starts the container
  - Waits for it to finish
  - Fetches logs
  - Deletes the container
  - Returns output in the HTTP response

---

## 📁 Project Structure

```
.
├── host.json
├── package.json
├── local.settings.json
└── RunDocker/
    ├── index.js
    └── function.json
```

---

## 🐳 Step 1: Create the Hello World Docker Image

### `app.js`

```js
console.log("🚀 Hello World from Docker running in Azure!");
```

---

### `Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY app.js .

CMD ["node", "app.js"]
```

---

### Build and Test Locally

```bash
docker build -t hello-aci .
docker run hello-aci
```

Expected output:

```
🚀 Hello World from Docker running in Azure!
```

---

## 📤 Step 2: Push Image to Azure Container Registry (ACR)

### Create ACR

```bash
az acr create \
  --resource-group my-rg \
  --name myacr12345 \
  --sku Basic
```

---

### Login to ACR

```bash
az acr login --name myacr12345
```

---

### Tag & Push Image

```bash
docker tag hello-aci myacr12345.azurecr.io/hello-aci:v1
docker push myacr12345.azurecr.io/hello-aci:v1
```

---

### Get ACR Credentials

```bash
az acr credential show --name myacr12345
```

Save:

- username
- password

---

## ⚡ Step 3: Azure Function Implementation

### `RunDocker/index.js`

```js
const {
  ContainerInstanceManagementClient,
} = require("@azure/arm-containerinstance");
const { DefaultAzureCredential } = require("@azure/identity");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function (context, req) {
  const credential = new DefaultAzureCredential();
  const client = new ContainerInstanceManagementClient(
    credential,
    process.env.AZURE_SUBSCRIPTION_ID
  );

  const resourceGroup = process.env.RESOURCE_GROUP;
  const containerGroupName = `hello-${Date.now()}`;

  context.log("🚀 Starting Docker container...");

  // Start container
  await client.containerGroups.beginCreateOrUpdate(
    resourceGroup,
    containerGroupName,
    {
      location: "eastus",
      osType: "Linux",
      restartPolicy: "Never",
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
      imageRegistryCredentials: [
        {
          server: process.env.ACR_SERVER,
          username: process.env.ACR_USERNAME,
          password: process.env.ACR_PASSWORD,
        },
      ],
    }
  );

  // Wait for completion
  let state = "Running";
  while (state === "Running") {
    await sleep(2000);

    const group = await client.containerGroups.get(
      resourceGroup,
      containerGroupName
    );

    state =
      group.containers?.[0]?.instanceView?.currentState?.state || "Unknown";
  }

  // Fetch logs
  const logs = await client.containers.listLogs(
    resourceGroup,
    containerGroupName,
    "hello"
  );

  // Cleanup
  await client.containerGroups.beginDelete(resourceGroup, containerGroupName);

  context.res = {
    status: 200,
    body: {
      message: "Docker container executed successfully",
      output: logs.content,
    },
  };
};
```

---

### `RunDocker/function.json`

```json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

---

## ⚙️ Configuration Files

### `host.json`

```json
{
  "version": "2.0"
}
```

---

### `package.json`

```json
{
  "name": "azure-function-run-docker",
  "version": "1.0.0",
  "dependencies": {
    "@azure/arm-containerinstance": "^9.1.0",
    "@azure/identity": "^4.0.0"
  }
}
```

---

### `local.settings.json`

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",

    "AZURE_SUBSCRIPTION_ID": "<subscription-id>",
    "RESOURCE_GROUP": "my-rg",
    "CONTAINER_IMAGE": "myacr12345.azurecr.io/hello-aci:v1",
    "ACR_SERVER": "myacr12345.azurecr.io",
    "ACR_USERNAME": "<acr-username>",
    "ACR_PASSWORD": "<acr-password>"
  }
}
```

---

## ▶️ Run Locally

```bash
npm install
func start
```

Call the function:

```bash
curl -X POST http://localhost:7071/api/RunDocker
```

---

## ✅ Example Response

```json
{
  "message": "Docker container executed successfully",
  "output": "🚀 Hello World from Docker running in Azure!"
}
```

---

## ⚠️ Important Notes

- This approach is **best for short-lived containers**
- Not recommended for long-running or high-concurrency workloads
- Azure Functions have execution time limits
- Containers are billed per second while running

---

## ✅ Recommended Production Pattern

For real systems:

```
API → Function → Start Container
API ← jobId

Client polls status/logs separately
```

---

## 📌 Summary

✔ Azure Function triggers Docker
✔ Docker runs in Azure Container Instance
✔ Output returned via HTTP
✔ Clean lifecycle (start → run → fetch logs → delete)

---

**Author**: Indrajith Chandran
**Platform**: Azure Functions + Azure Container Instances
