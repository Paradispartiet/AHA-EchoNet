targetScope = 'resourceGroup'

param location string
param jobName string = 'aha-canonical-db-init-production'
param containerAppsEnvironmentName string
param managedIdentityName string
param acrName string
param image string
param adminDatabaseUrlSecretUri string
param databaseCaSecretUri string
param readinessPasswordSecretUri string
@allowed([
  'apply'
  'verify_restore'
])
param mode string = 'apply'
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

resource job 'Microsoft.App/jobs@2025-01-01' = {
  name: jobName
  location: location
  tags: union(tags, {
    dbInitMode: mode
  })
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
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: runtimeIdentity.id
        }
      ]
      secrets: [
        {
          name: 'admin-database-url'
          keyVaultUrl: adminDatabaseUrlSecretUri
          identity: runtimeIdentity.id
        }
        {
          name: 'database-ca'
          keyVaultUrl: databaseCaSecretUri
          identity: runtimeIdentity.id
        }
        {
          name: 'readiness-password'
          keyVaultUrl: readinessPasswordSecretUri
          identity: runtimeIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'canonical-db-init'
          image: image
          env: [
            {
              name: 'AHA_DB_INIT_MODE'
              value: mode
            }
            {
              name: 'AHA_PRODUCTION_ADMIN_DATABASE_URL'
              secretRef: 'admin-database-url'
            }
            {
              name: 'AHA_PRODUCTION_DATABASE_CA_CERT'
              secretRef: 'database-ca'
            }
            {
              name: 'AHA_PRODUCTION_READINESS_PASSWORD'
              secretRef: 'readiness-password'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
}

output jobName string = job.name
output jobId string = job.id
output mode string = mode
