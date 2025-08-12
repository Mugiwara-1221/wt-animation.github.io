import fetch from "node-fetch";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();
const vaultName = "MyVaultName"; // Change to your vault
const vaultUrl = `https://${vaultName}.vault.azure.net`;
const secretClient = new SecretClient(vaultUrl, credential);

export default async function (context, req) {
  try {
    // Get API key from Key Vault
    const secret = await secretClient.getSecret("MyApiKey");
    const apiKey = secret.value;

    // Call your backend API
    const API_BASE = "https://windtreetechnology.documents.azure.com:443";
    const url = `${API_BASE}${req.query.path}?code=${apiKey}`;

    const response = await fetch(url, {
      method: req.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: req.body ? JSON.stringify(req.body) : undefined
    });

    const body = await response.json();
    context.res = {
      status: response.status,
      body
    };
  } catch (err) {
    context.log("Error:", err);
    context.res = { status: 500, body: { error: err.message } };
  }
}

