# ✅ Azure Prerequisites & Setup Plan

**(Azure Function → Run Docker → Return Response + Blob Storage)**

---

## 🔹 0. Goal (One-line)

Create an **HTTP API (Azure Function)** that **runs a pre-built Docker image (ACI)**, optionally **reads/writes to Blob Storage**, and **returns the container output** as the API response.

---

## 🔹 1. High-Level Plan (Simple Flow)

```
Client → Azure Function → Azure Container Instance → (Blob Storage) → Output → API Response
```

---

## 🔹 2. Azure Resources Required

Create the following **in this exact order**:

1. Resource Group
2. Azure Container Registry (ACR)
3. Blob Storage Account
4. Azure Function App (Node.js)
5. Permissions (Function → ACR + ACI + Blob)

---

## 🔹 3. Step-by-Step DevOps Checklist

### ✅ Step 1: Create Resource Group

```bash
az group create \
  --name rg-run-docker \
  --location eastus
```

---

### ✅ Step 2: Create Azure Container Registry (ACR)

```bash
az acr create \
  --resource-group rg-run-docker \
  --name acrrundocker123 \
  --sku Basic \
  --admin-enabled true
```

📌 Purpose:

- Store Docker images
- Used by Azure Container Instances

---

### ✅ Step 3: Build & Push Docker Image

```bash
az acr login --name acrrundocker123

docker build -t hello-aci .
docker tag hello-aci acrrundocker123.azurecr.io/hello-aci:v1
docker push acrrundocker123.azurecr.io/hello-aci:v1
```

📌 Purpose:

- Image must exist before Function can run it

---

### ✅ Step 4: Create Blob Storage Account

```bash
az storage account create \
  --name storagedocker123 \
  --resource-group rg-run-docker \
  --location eastus \
  --sku Standard_LRS
```

📌 Purpose:

- Optional input/output for container
- Logs, files, artifacts

---

### ✅ Step 5: Create Blob Container

```bash
az storage container create \
  --account-name storagedocker123 \
  --name job-data
```

---

### ✅ Step 6: Create Azure Function App (Node.js)

```bash
az functionapp create \
  --resource-group rg-run-docker \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name func-run-docker-aci \
  --storage-account storagedocker123
```

📌 Purpose:

- Public HTTP API
- Triggers container execution

---

### ✅ Step 7: Configure Function App Settings

Set environment variables:

```bash
az functionapp config appsettings set \
  --name func-run-docker-aci \
  --resource-group rg-run-docker \
  --settings \
  AZURE_SUBSCRIPTION_ID=<subscription-id> \
  RESOURCE_GROUP=rg-run-docker \
  CONTAINER_IMAGE=acrrundocker123.azurecr.io/hello-aci:v1 \
  ACR_SERVER=acrrundocker123.azurecr.io \
  ACR_USERNAME=<acr-username> \
  ACR_PASSWORD=<acr-password> \
  STORAGE_ACCOUNT_NAME=storagedocker123 \
  BLOB_CONTAINER_NAME=job-data
```

---

### ✅ Step 8: Permissions (IMPORTANT)

Assign **Contributor** role to Function App:

```bash
az role assignment create \
  --assignee <function-app-managed-identity> \
  --role Contributor \
  --scope /subscriptions/<subscription-id>/resourceGroups/rg-run-docker
```

📌 Purpose:

- Allow Function to create/delete ACI
- Access Blob Storage

---

### ✅ Step 9: Deploy Function Code

```bash
func azure functionapp publish func-run-docker-aci
```

---

### ✅ Step 10: Test End-to-End

```bash
curl -X POST https://func-run-docker-aci.azurewebsites.net/api/RunDocker
```

Expected response:

```json
{
  "message": "Docker container executed successfully",
  "output": "Hello World from Docker"
}
```

---

## 🔹 4. Local Testing (Optional)

Used only by developers.

```bash
npm install
func start
```

---

## 🔹 5. Final Notes for DevOps

- Containers must be **short-lived**
- Do NOT run long jobs in Functions
- Blob Storage is optional but recommended
- Use async pattern for production scale

---

## 🔹 6. Summary (1-Minute Read)

✔ Azure Function = API
✔ ACR = Docker image storage
✔ ACI = Docker runtime
✔ Blob Storage = input/output
✔ Function orchestrates everything
