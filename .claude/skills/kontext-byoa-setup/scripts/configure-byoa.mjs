#!/usr/bin/env node

import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { parseArgs } from "node:util";

const KNOWN_INTEGRATION_RECIPES = {
  github: {
    key: "github",
    name: "github",
    url: "https://api.githubcopilot.com/mcp/",
    authMode: "oauth",
    oauth: {
      provider: "github",
    },
  },
};

function integrationPayloadFromRecipe(recipe) {
  return {
    name: recipe.name,
    url: recipe.url,
    authMode: recipe.authMode,
    oauth: recipe.oauth,
  };
}

function normalizeBaseUrl(value) {
  return value.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function normalizeUrl(value) {
  return value.replace(/\/$/, "");
}

function parseJsonValue(name, raw, fallback) {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${(error).message}`);
  }
}

function parseClaimEntries(entries) {
  const claims = {};

  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error(
        `Invalid required claim "${entry}". Use key=value syntax.`,
      );
    }

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();

    if (!key || !value) {
      throw new Error(
        `Invalid required claim "${entry}". Use key=value syntax.`,
      );
    }

    claims[key] = value;
  }

  return claims;
}

function parseStringArray(name, raw, fallback) {
  if (!raw) {
    return fallback;
  }

  const parsed = parseJsonValue(name, raw, fallback);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error(`${name} must be a JSON array of strings.`);
  }

  return parsed;
}

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }

  return value;
}

async function requestToken({ baseUrl, resource, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "management:all",
    audience: resource,
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

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

  const token = await response.json();
  return token.access_token;
}

async function apiRequest({ baseUrl, token, method, path, body }) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
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
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
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

async function listAllIntegrations({ baseUrl, token }) {
  const items = [];
  let cursor;

  while (true) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/integrations${query}`,
    });

    items.push(...(response.items ?? []));

    if (!response.nextCursor) {
      return items;
    }

    cursor = response.nextCursor;
  }
}

async function ensureKnownIntegrations({
  baseUrl,
  token,
  applicationId,
  ensureKeys,
}) {
  if (ensureKeys.length === 0) {
    return [];
  }

  const allIntegrations = await listAllIntegrations({ baseUrl, token });
  const attached = await apiRequest({
    baseUrl,
    token,
    method: "GET",
    path: `/applications/${applicationId}/integrations`,
  });
  const attachedIds = new Set(attached.integrationIds ?? []);
  const results = [];

  for (const rawKey of ensureKeys) {
    const key = rawKey.toLowerCase();
    const recipe = KNOWN_INTEGRATION_RECIPES[key];
    if (!recipe) {
      throw new Error(
        `Unsupported known integration "${rawKey}". Supported values: ${Object.keys(
          KNOWN_INTEGRATION_RECIPES,
        ).join(", ")}`,
      );
    }

    const targetUrl = normalizeUrl(recipe.url);
    let integration =
      allIntegrations.find(
        (item) =>
          item.oauth?.provider?.toLowerCase() === recipe.oauth.provider &&
          normalizeUrl(item.url) === targetUrl,
      ) ??
      allIntegrations.find((item) => item.name === recipe.name) ??
      null;

    let created = false;
    let updated = false;

    if (!integration) {
      const createdResponse = await apiRequest({
        baseUrl,
        token,
        method: "POST",
        path: "/integrations",
        body: integrationPayloadFromRecipe(recipe),
      });
      integration = createdResponse.integration;
      allIntegrations.push(integration);
      created = true;
    } else {
      const needsUpdate =
        integration.name !== recipe.name ||
        normalizeUrl(integration.url) !== targetUrl ||
        integration.authMode !== recipe.authMode ||
        integration.oauth?.provider?.toLowerCase() !== recipe.oauth.provider;

      if (needsUpdate) {
        const updatedResponse = await apiRequest({
          baseUrl,
          token,
          method: "PATCH",
          path: `/integrations/${integration.id}`,
          body: integrationPayloadFromRecipe(recipe),
        });
        integration = updatedResponse.integration;
        updated = true;
      }
    }

    let refreshed = (
      await apiRequest({
        baseUrl,
        token,
        method: "GET",
        path: `/integrations/${integration.id}`,
      })
    ).integration;

    if (created || updated || !refreshed.oauth?.metadata) {
      const validation = await apiRequest({
        baseUrl,
        token,
        method: "POST",
        path: `/integrations/${integration.id}/validate`,
      });

      if (validation.status !== "valid") {
        throw new Error(
          `Known integration "${recipe.name}" failed validation: ${validation.message ?? "unknown error"}`,
        );
      }

      refreshed = (
        await apiRequest({
          baseUrl,
          token,
          method: "GET",
          path: `/integrations/${integration.id}`,
        })
      ).integration;
    }

    if (!attachedIds.has(integration.id)) {
      await apiRequest({
        baseUrl,
        token,
        method: "POST",
        path: `/applications/${applicationId}/integrations/${integration.id}`,
      });
      attachedIds.add(integration.id);
    }

    results.push({
      key: recipe.key,
      id: refreshed.id,
      name: refreshed.name,
      url: refreshed.url,
      created,
      updated,
      attached: true,
      provider: refreshed.oauth?.provider ?? null,
      issuer: refreshed.oauth?.issuer ?? null,
      validationStatus: refreshed.validationStatus ?? "unknown",
    });
  }

  return results;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "api-base-url": { type: "string" },
      "service-account-client-id": { type: "string" },
      "service-account-client-secret": { type: "string" },
      "application-id": { type: "string" },
      "application-name": { type: "string" },
      issuer: { type: "string" },
      "jwks-url": { type: "string" },
      audience: { type: "string" },
      "partner-api-key": { type: "string" },
      "rotate-api-key": { type: "boolean", default: false },
      "allowed-return-urls": { type: "string" },
      "required-claims-json": { type: "string" },
      algorithm: { type: "string", multiple: true },
      "required-claim": { type: "string", multiple: true },
      "ensure-integration": { type: "string", multiple: true },
      "max-token-age-seconds": { type: "string" },
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
  const resource =
    process.env.MANAGEMENT_API_RESOURCE || `${baseUrl}/api/v1`;
  const serviceAccountClientId = required(
    "KONTEXT_SERVICE_ACCOUNT_CLIENT_ID",
    values["service-account-client-id"] ||
      process.env.KONTEXT_SERVICE_ACCOUNT_CLIENT_ID,
  );
  const serviceAccountClientSecret = required(
    "KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET",
    values["service-account-client-secret"] ||
      process.env.KONTEXT_SERVICE_ACCOUNT_CLIENT_SECRET,
  );
  const applicationId =
    values["application-id"] || process.env.KONTEXT_APPLICATION_ID;
  const applicationName =
    values["application-name"] || process.env.KONTEXT_APPLICATION_NAME;
  const issuer = required(
    "BYOA_ISSUER",
    values.issuer || process.env.BYOA_ISSUER,
  );
  const jwksUrl = required(
    "BYOA_JWKS_URL",
    values["jwks-url"] || process.env.BYOA_JWKS_URL,
  );
  const audience = required(
    "BYOA_AUDIENCE",
    values.audience || process.env.BYOA_AUDIENCE,
  );

  if (!applicationId && !applicationName) {
    throw new Error(
      "Set KONTEXT_APPLICATION_ID or KONTEXT_APPLICATION_NAME to resolve the target application.",
    );
  }

  const algorithmsFromArgs = values.algorithm ?? [];
  const requiredClaimsFromArgs = values["required-claim"] ?? [];
  const ensureIntegrationsFromArgs = values["ensure-integration"] ?? [];

  const token = await requestToken({
    baseUrl,
    resource,
    clientId: serviceAccountClientId,
    clientSecret: serviceAccountClientSecret,
  });

  const application = applicationId
    ? (
        await apiRequest({
          baseUrl,
          token,
          method: "GET",
          path: `/applications/${applicationId}`,
        })
      ).application
    : (await listAllApplications({ baseUrl, token })).find(
        (item) => item.name === applicationName,
      );

  if (!application) {
    throw new Error(
      applicationId
        ? `Application ${applicationId} was not found.`
        : `Application named "${applicationName}" was not found.`,
    );
  }

  const oauth = (
    await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/applications/${application.id}/oauth`,
    })
  ).oauth;

  if (oauth.type !== "confidential") {
    throw new Error(
      `Application "${application.name}" is a public client. Bring your own auth requires a confidential application.`,
    );
  }

  const currentExternalAuth = application.externalAuth ?? null;
  const allowedAlgorithms =
    algorithmsFromArgs.length > 0
      ? algorithmsFromArgs
      : parseStringArray(
          "BYOA_ALLOWED_ALGORITHMS",
          process.env.BYOA_ALLOWED_ALGORITHMS,
          currentExternalAuth?.allowedAlgorithms ?? ["RS256"],
        );
  const maxTokenAgeSeconds = Number(
    values["max-token-age-seconds"] ||
      process.env.BYOA_MAX_TOKEN_AGE_SECONDS ||
      currentExternalAuth?.maxTokenAgeSeconds ||
      600,
  );

  if (!Number.isFinite(maxTokenAgeSeconds) || maxTokenAgeSeconds <= 0) {
    throw new Error("BYOA_MAX_TOKEN_AGE_SECONDS must be a positive number.");
  }

  const requiredClaims =
    requiredClaimsFromArgs.length > 0
      ? parseClaimEntries(requiredClaimsFromArgs)
      : parseJsonValue(
          "BYOA_REQUIRED_CLAIMS_JSON",
          values["required-claims-json"] ||
            process.env.BYOA_REQUIRED_CLAIMS_JSON,
          currentExternalAuth?.requiredClaims ?? {},
        );
  const allowedReturnUrls =
    values["allowed-return-urls"] || process.env.BYOA_ALLOWED_RETURN_URLS
      ? parseStringArray(
          "BYOA_ALLOWED_RETURN_URLS",
          values["allowed-return-urls"] ||
            process.env.BYOA_ALLOWED_RETURN_URLS,
          [],
        )
      : currentExternalAuth?.allowedReturnUrls ?? [];

  const providedApiKey =
    values["partner-api-key"] || process.env.BYOA_PARTNER_API_KEY;
  const rotateApiKey =
    values["rotate-api-key"] || process.env.BYOA_ROTATE_API_KEY === "true";

  let partnerApiKey;
  if (providedApiKey) {
    partnerApiKey = providedApiKey;
  } else if (rotateApiKey || !currentExternalAuth?.partnerApiKeyConfigured) {
    partnerApiKey = crypto.randomBytes(32).toString("hex");
  }

  const externalAuth = {
    enabled: true,
    issuer,
    jwksUrl,
    audience,
    allowedAlgorithms,
    requiredClaims,
    allowedReturnUrls,
    maxTokenAgeSeconds,
    ...(partnerApiKey ? { partnerApiKey } : {}),
  };

  await apiRequest({
    baseUrl,
    token,
    method: "PATCH",
    path: `/applications/${application.id}`,
    body: { externalAuth },
  });

  const ensuredIntegrations =
    ensureIntegrationsFromArgs.length > 0
      ? ensureIntegrationsFromArgs
      : parseStringArray(
          "BYOA_ENSURE_KNOWN_INTEGRATIONS",
          process.env.BYOA_ENSURE_KNOWN_INTEGRATIONS,
          [],
        );

  const integrationResults = await ensureKnownIntegrations({
    baseUrl,
    token,
    applicationId: application.id,
    ensureKeys: ensuredIntegrations,
  });

  const updated = (
    await apiRequest({
      baseUrl,
      token,
      method: "GET",
      path: `/applications/${application.id}`,
    })
  ).application;

  const result = {
    application: {
      id: updated.id,
      name: updated.name,
    },
    oauth: {
      type: oauth.type,
      clientId: oauth.clientId,
      gatewayUrl: oauth.gatewayUrl,
      redirectUris: oauth.redirectUris,
    },
    byoa: {
      enabled: updated.externalAuth?.enabled ?? false,
      issuer: updated.externalAuth?.issuer ?? issuer,
      jwksUrl: updated.externalAuth?.jwksUrl ?? jwksUrl,
      audience: updated.externalAuth?.audience ?? audience,
      allowedAlgorithms: updated.externalAuth?.allowedAlgorithms ?? allowedAlgorithms,
      allowedReturnUrls:
        updated.externalAuth?.allowedReturnUrls ?? allowedReturnUrls,
      maxTokenAgeSeconds:
        updated.externalAuth?.maxTokenAgeSeconds ?? maxTokenAgeSeconds,
      partnerApiKeyConfigured:
        updated.externalAuth?.partnerApiKeyConfigured ?? Boolean(partnerApiKey),
      generatedApiKey: partnerApiKey ?? null,
    },
    integrations: integrationResults,
  };

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Bring your own auth configured.");
  console.log("");
  console.log("Application:");
  console.log(`- Name: ${result.application.name}`);
  console.log(`- Application ID: ${result.application.id}`);
  console.log("");
  console.log("Bring your own auth:");
  console.log(`- Status: ${result.byoa.enabled ? "enabled" : "disabled"}`);
  console.log(`- Issuer: ${result.byoa.issuer}`);
  console.log(`- JWKS URL: ${result.byoa.jwksUrl}`);
  console.log(`- Audience: ${result.byoa.audience}`);
  console.log(
    `- Allowed return URLs: ${
      result.byoa.allowedReturnUrls.length > 0
        ? result.byoa.allowedReturnUrls.join(", ")
        : "none"
    }`,
  );
  console.log("");
  console.log("Use this next:");
  console.log("- Application ID is for POST /partner/connect-session");

  if (result.integrations.length > 0) {
    console.log("");
    console.log("Attached integrations:");
    for (const integration of result.integrations) {
      const change = integration.created
        ? "created"
        : integration.updated
          ? "updated"
          : "reused";
      console.log(
        `- ${integration.name} (${change}, validation=${integration.validationStatus})`,
      );
    }
  }

  if (result.byoa.generatedApiKey) {
    console.log("");
    console.log("BYOA API key (save now):");
    console.log(`- ${result.byoa.generatedApiKey}`);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Failed to configure BYOA.",
  );
  process.exit(1);
});
