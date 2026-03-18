#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, promisify } from "node:util";

const VALID_PROVIDER_TYPES = new Set(["preset", "custom"]);
const VALID_PROVIDER_PRESET_KEYS = new Set([
  "figma",
  "github",
  "linear",
  "notion",
  "slack",
  "google-workspace",
]);
const VALID_PROVIDER_AUTH_METHODS = new Set([
  "user_oauth",
  "user_key",
  "org_key",
]);
const execFileAsync = promisify(execFile);

function normalizeBaseUrl(value) {
  return value.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }

  return value;
}

function parseOptionalTrimmed(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredTrimmed(name, value) {
  const normalized = parseOptionalTrimmed(required(name, value));
  if (!normalized) {
    throw new Error(`${name} must not be empty.`);
  }

  return normalized;
}

function parseStringArray(name, raw, fallback) {
  if (!raw) {
    return fallback;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error(`${name} must be a JSON array of strings.`);
  }

  return parsed.map((value) => value.trim()).filter(Boolean);
}

function parseBoolean(name, value, fallback) {
  const normalized = parseOptionalTrimmed(value);
  if (!normalized) {
    return fallback;
  }

  const lower = normalized.toLowerCase();
  if (["1", "true", "yes"].includes(lower)) {
    return true;
  }
  if (["0", "false", "no"].includes(lower)) {
    return false;
  }

  throw new Error(`${name} must be one of: true, false, 1, 0, yes, no.`);
}

function normalizeProviderType(value, presetKey) {
  const normalized = parseOptionalTrimmed(value);
  if (!normalized) {
    return presetKey ? "preset" : undefined;
  }

  if (!VALID_PROVIDER_TYPES.has(normalized)) {
    throw new Error(
      `KONTEXT_PROVIDER_TYPE must be one of: ${Array.from(VALID_PROVIDER_TYPES).join(", ")}`,
    );
  }

  return normalized;
}

function normalizeProviderAuthMethod(value) {
  const normalized = parseOptionalTrimmed(value);
  if (!normalized) {
    return undefined;
  }

  if (!VALID_PROVIDER_AUTH_METHODS.has(normalized)) {
    throw new Error(
      `KONTEXT_PROVIDER_AUTH_METHOD must be one of: ${Array.from(VALID_PROVIDER_AUTH_METHODS).join(", ")}`,
    );
  }

  return normalized;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requestToken({ baseUrl, resource, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "management:all",
    audience: resource,
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Service account authentication failed (${response.status}): ${message}`,
    );
  }

  const payload = await response.json();
  return payload.access_token;
}

async function apiRequest({ baseUrl, token, method, path: requestPath, body }) {
  const response = await fetch(`${baseUrl}/api/v1${requestPath}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${method} ${requestPath} failed (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function listAllApplications({ baseUrl, token }) {
  const items = [];
  let cursor;

  while (true) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/applications${query}`,
    });

    items.push(...(response.items ?? []));
    if (!response.nextCursor) {
      return items;
    }

    cursor = response.nextCursor;
  }
}

async function listAllProviders({ baseUrl, token }) {
  const items = [];
  let cursor;

  while (true) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/providers${query}`,
    });

    items.push(...(response.items ?? []));
    if (!response.nextCursor) {
      return items;
    }

    cursor = response.nextCursor;
  }
}

function buildApplicationOauthPayload({
  redirectUris,
  pkceRequired,
  scopes,
  allowedResources,
}) {
  const payload = {
    type: "public",
    redirectUris,
    pkceRequired,
    scopes,
  };

  if (Array.isArray(allowedResources) && allowedResources.length > 0) {
    payload.allowedResources = allowedResources;
  }

  return payload;
}

async function resolveOrCreateApplication({
  baseUrl,
  token,
  applicationId,
  applicationName,
  createApplication,
  redirectUris,
  pkceRequired,
  scopes,
  allowedResources,
}) {
  let application;
  let oauth;
  let created = false;
  let updated = false;
  let allowedResourcesNote = null;

  if (applicationId) {
    const response = await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/applications/${applicationId}`,
    });
    application = response.application;
  } else {
    application = (await listAllApplications({ baseUrl, token })).find(
      (item) => item.name === applicationName,
    );
  }

  if (!application) {
    if (!createApplication) {
      throw new Error(
        `Application named "${applicationName}" was not found. Set KONTEXT_CREATE_APPLICATION=true to create it.`,
      );
    }

    if (redirectUris.length === 0) {
      throw new Error(
        "KONTEXT_APPLICATION_REDIRECT_URIS_JSON is required when creating a public application.",
      );
    }

    const createdResponse = await apiRequest({
      baseUrl,
      token,
      method: "POST",
      path: "/applications",
      body: {
        name: applicationName,
        oauth: buildApplicationOauthPayload({
          redirectUris,
          pkceRequired,
          scopes,
          allowedResources,
        }),
      },
    });

    application = createdResponse.application;
    oauth = createdResponse.oauth;
    created = true;
  } else {
    const oauthResponse = await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/applications/${application.id}/oauth`,
    });
    oauth = oauthResponse.oauth;
  }

  if (oauth.type !== "public") {
    throw new Error(
      `Application "${application.name}" is a ${oauth.type} client. Token mode bootstrap requires a public application.`,
    );
  }

  if (!created) {
    const patch = {};

    if (oauth.pkceRequired !== pkceRequired) {
      patch.pkceRequired = pkceRequired;
    }

    const currentScopes = Array.isArray(oauth.scopes) ? oauth.scopes : [];
    if (!arraysEqual(currentScopes, scopes)) {
      patch.scopes = scopes;
    }

    if (redirectUris.length > 0) {
      const currentRedirectUris = Array.isArray(oauth.redirectUris)
        ? oauth.redirectUris
        : [];
      if (!arraysEqual(currentRedirectUris, redirectUris)) {
        patch.redirectUris = redirectUris;
      }
    }

    if (allowedResources.length > 0) {
      allowedResourcesNote =
        "Existing application reused. allowedResources were not mutated by this script.";
    }

    if (Object.keys(patch).length > 0) {
      const patched = await apiRequest({
        baseUrl,
        token,
        method: "PATCH",
        path: `/applications/${application.id}/oauth`,
        body: patch,
      });
      oauth = patched.oauth;
      updated = true;
    }
  }

  return {
    application,
    oauth,
    created,
    updated,
    allowedResourcesNote,
  };
}

function buildDesiredProvider({
  providerType,
  providerPresetKey,
  providerHandle,
  providerDisplayName,
  providerAuthMethod,
  providerScopes,
  providerOauthIssuer,
  providerOauthProvider,
  providerClientId,
  providerClientSecret,
  providerOrganizationKey,
}) {
  const clientId = parseOptionalTrimmed(providerClientId);
  const clientSecret = parseOptionalTrimmed(providerClientSecret);
  const key = parseOptionalTrimmed(providerOrganizationKey);
  const displayName = parseOptionalTrimmed(providerDisplayName);
  const handle = parseOptionalTrimmed(providerHandle);
  const authMethod = normalizeProviderAuthMethod(providerAuthMethod);
  const oauthIssuer = parseOptionalTrimmed(providerOauthIssuer);
  const oauthProvider = parseOptionalTrimmed(providerOauthProvider);
  const presetKey =
    parseOptionalTrimmed(providerPresetKey) ||
    (handle && VALID_PROVIDER_PRESET_KEYS.has(handle) ? handle : undefined);
  const type = normalizeProviderType(providerType, presetKey);

  if (!type) {
    return { create: null, update: null };
  }

  if (type === "preset") {
    if (!presetKey) {
      throw new Error(
        "Preset provider bootstrap requires KONTEXT_PROVIDER_PRESET_KEY.",
      );
    }

    return {
      create: {
        type: "preset",
        presetKey,
        ...(providerScopes.length > 0 ? { scopes: providerScopes } : {}),
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
      update: {
        ...(providerScopes.length > 0 ? { scopes: providerScopes } : {}),
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    };
  }

  if (!displayName && !authMethod) {
    return { create: null, update: null };
  }

  if (!displayName || !authMethod) {
    throw new Error(
      "Custom provider bootstrap requires both KONTEXT_PROVIDER_DISPLAY_NAME and KONTEXT_PROVIDER_AUTH_METHOD.",
    );
  }

  if (authMethod === "user_oauth" && !oauthIssuer) {
    throw new Error(
      "Custom OAuth providers require KONTEXT_PROVIDER_OAUTH_ISSUER.",
    );
  }

    return {
      create: {
        type: "custom",
      displayName,
      authMethod,
      ...(authMethod === "user_oauth"
        ? {
            oauth: {
              issuer: oauthIssuer,
              ...(oauthProvider ? { provider: oauthProvider } : {}),
              ...(providerScopes.length > 0 ? { scopes: providerScopes } : {}),
              ...(clientId ? { clientId } : {}),
              ...(clientSecret ? { clientSecret } : {}),
            },
          }
        : {}),
      ...(authMethod === "org_key" && key ? { key } : {}),
    },
    update: {
      ...(displayName ? { displayName } : {}),
      ...(providerScopes.length > 0 ? { scopes: providerScopes } : {}),
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      ...(oauthIssuer ? { issuer: oauthIssuer } : {}),
      ...(oauthProvider ? { provider: oauthProvider } : {}),
    },
  };
}

async function resolveExistingProvider({
  baseUrl,
  token,
  providerId,
  providerHandle,
  providerDisplayName,
  providerPresetKey,
}) {
  if (providerId) {
    const response = await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/providers/${providerId}`,
    });
    return response.provider;
  }

  const providers = await listAllProviders({ baseUrl, token });

  if (providerHandle) {
    const exact = providers.find((item) => item.handle === providerHandle);
    if (exact) {
      return exact;
    }
  }

  if (providerDisplayName) {
    const exact = providers.find((item) => item.displayName === providerDisplayName);
    if (exact) {
      return exact;
    }
  }

  if (providerPresetKey) {
    return providers.find((item) => item.presetKey === providerPresetKey) ?? null;
  }

  return null;
}

function hasProviderUpdate(update) {
  return Boolean(update && Object.keys(update).length > 0);
}

async function upsertProvider({
  baseUrl,
  token,
  existing,
  desired,
}) {
  let provider = existing;
  let created = false;
  let updated = false;

  if (!provider) {
    if (!desired.create) {
      throw new Error(
        "Creating a provider requires KONTEXT_PROVIDER_PRESET_KEY for preset providers, or KONTEXT_PROVIDER_DISPLAY_NAME plus KONTEXT_PROVIDER_AUTH_METHOD for custom providers.",
      );
    }

    const createdResponse = await apiRequest({
      baseUrl,
      token,
      method: "POST",
      path: "/providers",
      body: desired.create,
    });
    provider = createdResponse.provider;
    created = true;
  } else if (hasProviderUpdate(desired.update)) {
    const updatedResponse = await apiRequest({
      baseUrl,
      token,
      method: "PATCH",
      path: `/providers/${provider.id}`,
      body: desired.update,
    });
    provider = updatedResponse.provider;
    updated = true;
  }

  const refreshed = (
    await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/providers/${provider.id}`,
    })
  ).provider;

  return {
    provider: refreshed,
    created,
    updated,
  };
}

async function ensureAttached({
  baseUrl,
  token,
  applicationId,
  providerId,
  mcpEnabled,
}) {
  const attached = await apiRequest({
    baseUrl,
    token,
    method: "GET",
    path: `/applications/${applicationId}/providers`,
  });

  const items = attached.items ?? [];
  if (items.some((item) => item.providerId === providerId)) {
    return {
      attached: false,
      revision: attached.revision,
    };
  }

  const nextItems = [
    ...items.map((item) => ({
      providerId: item.providerId,
      mcpEnabled: item.mcpEnabled,
    })),
    { providerId, mcpEnabled },
  ];

  const updated = await apiRequest({
    baseUrl,
    token,
    method: "PUT",
    path: `/applications/${applicationId}/providers`,
    body: {
      expectedRevision: attached.revision,
      items: nextItems,
    },
  });

  return {
    attached: true,
    revision: updated.revision,
  };
}

async function ensureFileIsNotTracked(absolutePath) {
  let repoRoot;

  try {
    const result = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: path.dirname(absolutePath),
    });
    repoRoot = result.stdout.trim();
  } catch {
    return;
  }

  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..")) {
    return;
  }

  try {
    await execFileAsync("git", ["ls-files", "--error-unmatch", relativePath], {
      cwd: repoRoot,
    });
    throw new Error(
      `Refusing to write ${absolutePath} because it is tracked by git. Use a local-only env file instead.`,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Refusing to write")
    ) {
      throw error;
    }
  }
}

async function writeEnvValue({ outputFile, variableName, value }) {
  const absolutePath = path.resolve(outputFile);
  await ensureFileIsNotTracked(absolutePath);
  let contents = "";

  try {
    contents = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const line = `${variableName}=${value}`;
  const pattern = new RegExp(`^${escapeRegex(variableName)}=.*$`, "m");
  let nextContents;

  if (pattern.test(contents)) {
    nextContents = contents.replace(pattern, line);
  } else if (contents.length === 0) {
    nextContents = `${line}\n`;
  } else {
    const separator = contents.endsWith("\n") ? "" : "\n";
    nextContents = `${contents}${separator}${line}\n`;
  }

  await fs.writeFile(absolutePath, nextContents, "utf8");
  return absolutePath;
}

function buildRuntimeSummary(providerHandle) {
  return {
    retrievalMethod: "kontext.requireProvider(providerHandle, token)",
    providerHandle,
    firstTimeConnect: "hosted_connect",
    note: "Pass the authenticated Kontext token into runtime code and handle ProviderConnectionRequiredError for first-time connect.",
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "api-base-url": { type: "string" },
      "service-account-client-id": { type: "string" },
      "service-account-client-secret": { type: "string" },
      "application-id": { type: "string" },
      "application-name": { type: "string" },
      "create-application": { type: "boolean", default: false },
      "application-redirect-uris": { type: "string" },
      "application-scopes": { type: "string" },
      "application-pkce-required": { type: "string" },
      "application-allowed-resources": { type: "string" },
      "provider-id": { type: "string" },
      "provider-handle": { type: "string" },
      "provider-display-name": { type: "string" },
      "provider-type": { type: "string" },
      "provider-preset-key": { type: "string" },
      "provider-auth-method": { type: "string" },
      "provider-scopes": { type: "string" },
      "provider-oauth-issuer": { type: "string" },
      "provider-oauth-provider": { type: "string" },
      "provider-client-id": { type: "string" },
      "provider-client-secret": { type: "string" },
      "provider-key": { type: "string" },
      "provider-mcp-enabled": { type: "string" },
      "output-env-file": { type: "string" },
      "public-client-id-env-name": { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  }

  const baseUrl = normalizeBaseUrl(
    values["api-base-url"] ||
      process.env.KONTEXT_API_BASE_URL ||
      "https://api.kontext.dev",
  );
  const resource = process.env.MANAGEMENT_API_RESOURCE || `${baseUrl}/api/v1`;
  const serviceAccountClientId = requiredTrimmed(
    "KONTEXT_SERVICE_ACCOUNT_CLIENT_ID",
    values["service-account-client-id"] ||
      process.env.KONTEXT_SERVICE_ACCOUNT_CLIENT_ID,
  );
  const serviceAccountClientSecret = requiredTrimmed(
    "KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET",
    values["service-account-client-secret"] ||
      process.env.KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET,
  );
  const applicationId = parseOptionalTrimmed(
    values["application-id"] || process.env.KONTEXT_APPLICATION_ID,
  );
  const applicationName = parseOptionalTrimmed(
    values["application-name"] || process.env.KONTEXT_APPLICATION_NAME,
  );
  const createApplication =
    values["create-application"] ||
    process.env.KONTEXT_CREATE_APPLICATION === "true";
  const redirectUris = parseStringArray(
    "KONTEXT_APPLICATION_REDIRECT_URIS_JSON",
    values["application-redirect-uris"] ||
      process.env.KONTEXT_APPLICATION_REDIRECT_URIS_JSON,
    [],
  );
  const applicationScopes = parseStringArray(
    "KONTEXT_APPLICATION_SCOPES_JSON",
    values["application-scopes"] || process.env.KONTEXT_APPLICATION_SCOPES_JSON,
    ["mcp:invoke"],
  );
  const pkceRequired = parseBoolean(
    "KONTEXT_APPLICATION_PKCE_REQUIRED",
    values["application-pkce-required"] ||
      process.env.KONTEXT_APPLICATION_PKCE_REQUIRED,
    true,
  );
  const allowedResources = parseStringArray(
    "KONTEXT_APPLICATION_ALLOWED_RESOURCES_JSON",
    values["application-allowed-resources"] ||
      process.env.KONTEXT_APPLICATION_ALLOWED_RESOURCES_JSON,
    ["mcp-gateway"],
  );

  const providerId = parseOptionalTrimmed(
    values["provider-id"] || process.env.KONTEXT_PROVIDER_ID,
  );
  const providerHandle = parseOptionalTrimmed(
    values["provider-handle"] || process.env.KONTEXT_PROVIDER_HANDLE,
  );
  const providerDisplayName = parseOptionalTrimmed(
    values["provider-display-name"] || process.env.KONTEXT_PROVIDER_DISPLAY_NAME,
  );
  const providerType = parseOptionalTrimmed(
    values["provider-type"] || process.env.KONTEXT_PROVIDER_TYPE,
  );
  const providerPresetKey = parseOptionalTrimmed(
    values["provider-preset-key"] || process.env.KONTEXT_PROVIDER_PRESET_KEY,
  );
  const providerAuthMethod = parseOptionalTrimmed(
    values["provider-auth-method"] || process.env.KONTEXT_PROVIDER_AUTH_METHOD,
  );
  const providerScopes = parseStringArray(
    "KONTEXT_PROVIDER_SCOPES_JSON",
    values["provider-scopes"] || process.env.KONTEXT_PROVIDER_SCOPES_JSON,
    [],
  );
  const providerOauthIssuer = parseOptionalTrimmed(
    values["provider-oauth-issuer"] ||
      process.env.KONTEXT_PROVIDER_OAUTH_ISSUER,
  );
  const providerOauthProvider = parseOptionalTrimmed(
    values["provider-oauth-provider"] ||
      process.env.KONTEXT_PROVIDER_OAUTH_PROVIDER,
  );
  const providerClientId = parseOptionalTrimmed(
    values["provider-client-id"] || process.env.KONTEXT_PROVIDER_CLIENT_ID,
  );
  const providerClientSecret = parseOptionalTrimmed(
    values["provider-client-secret"] ||
      process.env.KONTEXT_PROVIDER_CLIENT_SECRET,
  );
  const providerOrganizationKey = parseOptionalTrimmed(
    values["provider-key"] || process.env.KONTEXT_PROVIDER_KEY,
  );
  const providerMcpEnabled = parseBoolean(
    "KONTEXT_PROVIDER_MCP_ENABLED",
    values["provider-mcp-enabled"] || process.env.KONTEXT_PROVIDER_MCP_ENABLED,
    false,
  );
  const outputEnvFile = parseOptionalTrimmed(
    values["output-env-file"] || process.env.KONTEXT_OUTPUT_ENV_FILE,
  );
  const publicClientIdEnvName =
    parseOptionalTrimmed(
      values["public-client-id-env-name"] ||
        process.env.KONTEXT_PUBLIC_CLIENT_ID_ENV_NAME,
    ) || "NEXT_PUBLIC_KONTEXT_CLIENT_ID";

  if (!applicationId && !applicationName) {
    throw new Error(
      "Set KONTEXT_APPLICATION_ID or KONTEXT_APPLICATION_NAME to resolve the target application.",
    );
  }

  const token = await requestToken({
    baseUrl,
    resource,
    clientId: serviceAccountClientId,
    clientSecret: serviceAccountClientSecret,
  });

  const applicationResult = await resolveOrCreateApplication({
    baseUrl,
    token,
    applicationId,
    applicationName,
    createApplication,
    redirectUris,
    pkceRequired,
    scopes: applicationScopes,
    allowedResources,
  });

  const desiredProvider = buildDesiredProvider({
    providerType,
    providerPresetKey,
    providerHandle,
    providerDisplayName,
    providerAuthMethod,
    providerScopes,
    providerOauthIssuer,
    providerOauthProvider,
    providerClientId,
    providerClientSecret,
    providerOrganizationKey,
  });

  const existingProvider = await resolveExistingProvider({
    baseUrl,
    token,
    providerId,
    providerHandle,
    providerDisplayName,
    providerPresetKey,
  });

  if (!existingProvider && !desiredProvider.create) {
    throw new Error(
      "Set KONTEXT_PROVIDER_ID or KONTEXT_PROVIDER_HANDLE to reuse an existing provider, or provide provider creation inputs such as KONTEXT_PROVIDER_PRESET_KEY or KONTEXT_PROVIDER_DISPLAY_NAME plus KONTEXT_PROVIDER_AUTH_METHOD.",
    );
  }

  const providerResult = await upsertProvider({
    baseUrl,
    token,
    existing: existingProvider,
    desired: desiredProvider,
  });

  const attachmentResult = await ensureAttached({
    baseUrl,
    token,
    applicationId: applicationResult.application.id,
    providerId: providerResult.provider.id,
    mcpEnabled: providerMcpEnabled,
  });

  let envOutput = null;
  if (outputEnvFile) {
    const writtenFile = await writeEnvValue({
      outputFile: outputEnvFile,
      variableName: publicClientIdEnvName,
      value: applicationResult.oauth.clientId,
    });
    envOutput = {
      file: writtenFile,
      variable: publicClientIdEnvName,
      value: applicationResult.oauth.clientId,
    };
  }

  const result = {
    application: {
      id: applicationResult.application.id,
      name: applicationResult.application.name,
      oauthType: applicationResult.oauth.type,
      clientId: applicationResult.oauth.clientId,
      redirectUris: applicationResult.oauth.redirectUris ?? [],
      scopes: applicationResult.oauth.scopes ?? [],
      pkceRequired: applicationResult.oauth.pkceRequired,
      created: applicationResult.created,
      updated: applicationResult.updated,
      allowedResourcesNote: applicationResult.allowedResourcesNote,
    },
    provider: {
      id: providerResult.provider.id,
      handle: providerResult.provider.handle,
      displayName: providerResult.provider.displayName,
      kind: providerResult.provider.kind,
      authMethod: providerResult.provider.authMethod,
      presetKey: providerResult.provider.presetKey ?? null,
      oauthProvider: providerResult.provider.oauthProvider ?? null,
      oauthIssuer: providerResult.provider.oauthIssuer ?? null,
      oauthScopes: providerResult.provider.oauthScopes ?? [],
      created: providerResult.created,
      updated: providerResult.updated,
      attached: attachmentResult.attached ? "attached_now" : "already_attached",
      providerRevision: attachmentResult.revision,
    },
    runtime: buildRuntimeSummary(providerResult.provider.handle),
    envOutput,
  };

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Token-mode bootstrap configured.");
  console.log("");
  console.log("Application:");
  console.log(`- Name: ${result.application.name}`);
  console.log(`- Application ID: ${result.application.id}`);
  console.log(`- OAuth type: ${result.application.oauthType}`);
  console.log(`- Client ID: ${result.application.clientId}`);
  console.log(`- PKCE required: ${result.application.pkceRequired ? "yes" : "no"}`);
  console.log(
    `- Redirect URIs: ${
      result.application.redirectUris.length > 0
        ? result.application.redirectUris.join(", ")
        : "none"
    }`,
  );
  console.log(
    `- Scopes: ${
      result.application.scopes.length > 0
        ? result.application.scopes.join(", ")
        : "none"
    }`,
  );
  console.log(
    `- Status: ${
      result.application.created
        ? "created"
        : result.application.updated
          ? "updated"
          : "reused"
    }`,
  );
  if (result.application.allowedResourcesNote) {
    console.log(`- Note: ${result.application.allowedResourcesNote}`);
  }

  console.log("");
  console.log("Provider:");
  console.log(`- Display name: ${result.provider.displayName}`);
  console.log(`- Handle: ${result.provider.handle}`);
  console.log(`- Provider ID: ${result.provider.id}`);
  console.log(`- Kind: ${result.provider.kind}`);
  console.log(`- Auth method: ${result.provider.authMethod}`);
  if (result.provider.presetKey) {
    console.log(`- Preset key: ${result.provider.presetKey}`);
  }
  if (result.provider.oauthProvider) {
    console.log(`- OAuth provider: ${result.provider.oauthProvider}`);
  }
  if (result.provider.oauthIssuer) {
    console.log(`- OAuth issuer: ${result.provider.oauthIssuer}`);
  }
  if (result.provider.oauthScopes.length > 0) {
    console.log(`- OAuth scopes: ${result.provider.oauthScopes.join(", ")}`);
  }
  console.log(
    `- Status: ${
      result.provider.created
        ? "created"
        : result.provider.updated
          ? "updated"
          : "reused"
    }`,
  );
  console.log(`- App attachment: ${result.provider.attached}`);

  console.log("");
  console.log("Runtime:");
  console.log(`- Retrieval method: ${result.runtime.retrievalMethod}`);
  console.log(`- Provider handle: ${result.runtime.providerHandle}`);
  console.log(`- First-time connect: ${result.runtime.firstTimeConnect}`);
  console.log(`- Notes: ${result.runtime.note}`);

  if (result.envOutput) {
    console.log("");
    console.log("Env output:");
    console.log(`- File: ${result.envOutput.file}`);
    console.log(`- Variable: ${result.envOutput.variable}`);
    console.log(`- Value: ${result.envOutput.value}`);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Failed to bootstrap token-mode configuration.",
  );
  process.exit(1);
});
