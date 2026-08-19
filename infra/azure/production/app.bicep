param location string = resourceGroup().location
param containerAppName string
param containerAppsEnvironmentName string
param managedIdentityName string
param acrName string
param keyVaultName string
param image string
param databaseUrlSecretUri string
param databaseCaSecretUri string
param auditSaltSecretUri string
param applicationInsightsConnectionString string
param deployRevision string = ''
param pilotProfileIdSecretUri string = ''
param canonicalSyncEnabled bool = false
param runtimeActivated bool = false
param fysenIntegrationEnabled bool = true
param fysenRedirectUris string = 'https://fysen-matsgran-8572s-projects.vercel.app/api/aha/callback'
@minValue(60)
@maxValue(600)
param fysenAuthorizationTtlSeconds int = 180

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: containerAppsEnvironmentName
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: managedIdentityName
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: acrName
}

resource keyVault 'Microsoft.KeyVault/vaults@2025-05-01' existing = {
  name: keyVaultName
}

var baseSecrets = [
  {
    name: 'database-url'
    keyVaultUrl: databaseUrlSecretUri
    identity: runtimeIdentity.id
  }
  {
    name: 'database-ca'
    keyVaultUrl: databaseCaSecretUri
    identity: runtimeIdentity.id
  }
  {
    name: 'audit-salt'
    keyVaultUrl: auditSaltSecretUri
    identity: runtimeIdentity.id
  }
]

var pilotSecrets = canonicalSyncEnabled ? [
  {
    name: 'pilot-profile-id'
    keyVaultUrl: pilotProfileIdSecretUri
    identity: runtimeIdentity.id
  }
] : []

var appSecrets = concat(baseSecrets, pilotSecrets)

var baseEnv = [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'PORT'
    value: '3000'
  }
  {
    name: 'AHA_SERVICE_NAME'
    value: 'aha-nest-api'
  }
  {
    name: 'AHA_SERVICE_VERSION'
    value: empty(deployRevision) ? 'azure-production' : deployRevision
  }
  {
    name: 'AHA_DEPLOY_REVISION'
    value: deployRevision
  }
  {
    name: 'AHA_RUNTIME_ACTIVATED'
    value: runtimeActivated ? 'true' : 'false'
  }
  {
    name: 'AHA_AUTH_JWKS_URL'
    value: 'https://sstuzwppsheivczyqrim.supabase.co/auth/v1/.well-known/jwks.json'
  }
  {
    name: 'AHA_AUTH_ISSUER'
    value: 'https://sstuzwppsheivczyqrim.supabase.co/auth/v1'
  }
  {
    name: 'AHA_AUTH_AUDIENCE'
    value: 'authenticated'
  }
  {
    name: 'AHA_DATABASE_ENABLED'
    value: 'true'
  }
  {
    name: 'AHA_DATABASE_URL'
    secretRef: 'database-url'
  }
  {
    name: 'AHA_DATABASE_SSL_MODE'
    value: 'verify-full'
  }
  {
    name: 'AHA_DATABASE_SSL_CA_CERT'
    secretRef: 'database-ca'
  }
  {
    name: 'AHA_DATABASE_MAX_CONNECTIONS'
    value: '8'
  }
  {
    name: 'AHA_DATABASE_CONNECTION_TIMEOUT_MS'
    value: '5000'
  }
  {
    name: 'AHA_DATABASE_STATEMENT_TIMEOUT_MS'
    value: '10000'
  }
  {
    name: 'AHA_DATABASE_IDLE_TIMEOUT_MS'
    value: '30000'
  }
  {
    name: 'AHA_AUDIT_HASH_SALT'
    secretRef: 'audit-salt'
  }
  {
    name: 'AHA_LOCAL_IMPORT_ENABLED'
    value: 'false'
  }
  {
    name: 'AHA_CANONICAL_SYNC_ENABLED'
    value: canonicalSyncEnabled ? 'true' : 'false'
  }
  {
    name: 'AHA_CANONICAL_SYNC_MAX_LIMIT'
    value: '100'
  }
  {
    name: 'AHA_CANONICAL_SYNC_MAX_CHANGES_PER_PUSH'
    value: '50'
  }
  {
    name: 'AHA_CANONICAL_SYNC_MAX_PAYLOAD_BYTES'
    value: '262144'
  }
  {
    name: 'AHA_CANONICAL_SYNC_MAX_PAYLOAD_JSON_BYTES'
    value: '131072'
  }
  {
    name: 'AHA_CANONICAL_SYNC_MAX_CANONICAL_JSON_BYTES'
    value: '131072'
  }
  {
    name: 'AHA_CANONICAL_SYNC_MAX_TOMBSTONE_JSON_BYTES'
    value: '32768'
  }
  {
    name: 'AHA_FYSEN_INTEGRATION_ENABLED'
    value: fysenIntegrationEnabled ? 'true' : 'false'
  }
  {
    name: 'AHA_FYSEN_AUTHORIZATION_TTL_SECONDS'
    value: string(fysenAuthorizationTtlSeconds)
  }
  {
    name: 'AHA_FYSEN_REDIRECT_URIS'
    value: fysenRedirectUris
  }
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: applicationInsightsConnectionString
  }
]

var pilotEnv = canonicalSyncEnabled ? [
  {
    name: 'AHA_CANONICAL_SYNC_PILOT_PROFILE_ID'
    secretRef: 'pilot-profile-id'
  }
] : []

var appEnv = concat(baseEnv, pilotEnv)

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: runtimeIdentity.id
        }
      ]
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          env: appEnv
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/v1/health'
                port: 3000
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/v1/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output containerAppId string = containerApp.id
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output imageDeployed string = image
output canonicalSyncEnabled bool = canonicalSyncEnabled
output runtimeActivated bool = runtimeActivated
output fysenIntegrationEnabled bool = fysenIntegrationEnabled
output fysenRedirectUris string = fysenRedirectUris
