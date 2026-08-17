targetScope = 'resourceGroup'

param location string
param containerAppName string = 'aha-canonical-api-production'
param containerAppsEnvironmentName string
param managedIdentityName string
param acrName string
param keyVaultName string
param image string
param deployRevision string
param allowedOrigin string = 'https://paradispartiet.github.io'
param authIssuer string = 'https://wshmybqyksrwkawqleiz.supabase.co/auth/v1'
param authAudience string = 'authenticated'
param authJwksUrl string = 'https://wshmybqyksrwkawqleiz.supabase.co/auth/v1/.well-known/jwks.json'
param databaseUrlSecretUri string
param databaseCaSecretUri string
param auditSaltSecretUri string
param applicationInsightsConnectionString string
param tags object = {}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: containerAppsEnvironmentName
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: managedIdentityName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource keyVault 'Microsoft.KeyVault/vaults@2025-05-01' existing = {
  name: keyVaultName
}

resource api 'Microsoft.App/containerApps@2025-01-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentity.id}': {}
    }
  }
  properties: {
    environmentId: managedEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3100
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: runtimeIdentity.id
        }
      ]
      secrets: [
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
    }
    template: {
      containers: [
        {
          name: 'aha-nest-api'
          image: image
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3100'
            }
            {
              name: 'AHA_API_VERSION'
              value: deployRevision
            }
            {
              name: 'AHA_ALLOWED_ORIGINS'
              value: allowedOrigin
            }
            {
              name: 'AHA_AUTH_PROVIDER'
              value: 'supabase'
            }
            {
              name: 'AHA_AUTH_ISSUER'
              value: authIssuer
            }
            {
              name: 'AHA_AUTH_AUDIENCE'
              value: authAudience
            }
            {
              name: 'AHA_AUTH_JWKS_URL'
              value: authJwksUrl
            }
            {
              name: 'AHA_AUDIT_HASH_SALT'
              secretRef: 'audit-salt'
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
              name: 'AHA_DATABASE_POOL_MAX'
              value: '4'
            }
            {
              name: 'AHA_CANONICAL_SYNC_ENABLED'
              value: 'false'
            }
            {
              name: 'AHA_LOCAL_IMPORT_ENABLED'
              value: 'false'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: applicationInsightsConnectionString
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/v1/health'
                port: 3100
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/v1/health'
                port: 3100
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
  dependsOn: [
    keyVault
  ]
}

output containerAppName string = api.name
output containerAppFqdn string = api.properties.configuration.ingress.fqdn
output productionApiOrigin string = 'https://${api.properties.configuration.ingress.fqdn}'
output syncEnabled bool = false
output deployRevision string = deployRevision
