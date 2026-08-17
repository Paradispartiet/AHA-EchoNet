targetScope = 'subscription'

@description('Azure region in EU/EEA for AHA production resources.')
param location string = 'westeurope'

@description('Dedicated AHA production resource group name.')
param resourceGroupName string = 'rg-aha-canonical-prod'

@description('Stable resource prefix. Keep short because several Azure resources have global naming limits.')
param prefix string = 'aha-prod'

@description('PostgreSQL administrator login. This account is migration-only and never enters the API runtime.')
param postgresAdministratorLogin string = 'ahaadmin'

@secure()
@description('PostgreSQL administrator password. Supply only from a protected deployment environment.')
param postgresAdministratorPassword string

@description('Object ID of the GitHub OIDC deployment service principal. Used only for scoped Key Vault secret lifecycle access.')
param deploymentPrincipalObjectId string

@allowed([
  'Disabled'
  'SameZone'
  'ZoneRedundant'
])
@description('PostgreSQL HA mode. ZoneRedundant can be enabled after regional quota/capacity is verified.')
param postgresHighAvailabilityMode string = 'Disabled'

param tags object = {
  application: 'AHA-EchoNet'
  environment: 'production'
  dataClass: 'private-canonical'
  managedBy: 'bicep'
}

resource productionRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module platform './platform.bicep' = {
  name: 'aha-production-platform'
  scope: productionRg
  params: {
    location: location
    prefix: prefix
    postgresAdministratorLogin: postgresAdministratorLogin
    postgresAdministratorPassword: postgresAdministratorPassword
    postgresHighAvailabilityMode: postgresHighAvailabilityMode
    tags: tags
  }
}

module operations './operations.bicep' = {
  name: 'aha-production-operations'
  scope: productionRg
  params: {
    location: location
    prefix: prefix
    acrName: platform.outputs.acrName
    tags: tags
  }
}

module postgresConfig './postgres-config.bicep' = {
  name: 'aha-production-postgres-config'
  scope: productionRg
  params: {
    postgresServerName: platform.outputs.postgresServerName
  }
}

module runtimeDeploymentAccess './deployment-access.bicep' = {
  name: 'aha-production-runtime-secret-deployment-access'
  scope: productionRg
  params: {
    keyVaultName: platform.outputs.keyVaultName
    deploymentPrincipalObjectId: deploymentPrincipalObjectId
  }
}

module operationsDeploymentAccess './deployment-access.bicep' = {
  name: 'aha-production-ops-secret-deployment-access'
  scope: productionRg
  params: {
    keyVaultName: operations.outputs.operationsKeyVaultName
    deploymentPrincipalObjectId: deploymentPrincipalObjectId
  }
}

output resourceGroupName string = productionRg.name
output resourceGroupId string = productionRg.id
output containerAppsEnvironmentName string = platform.outputs.containerAppsEnvironmentName
output containerAppsEnvironmentId string = platform.outputs.containerAppsEnvironmentId
output managedIdentityName string = platform.outputs.managedIdentityName
output managedIdentityId string = platform.outputs.managedIdentityId
output migrationIdentityName string = operations.outputs.migrationIdentityName
output migrationIdentityId string = operations.outputs.migrationIdentityId
output keyVaultName string = platform.outputs.keyVaultName
output keyVaultUri string = platform.outputs.keyVaultUri
output operationsKeyVaultName string = operations.outputs.operationsKeyVaultName
output operationsKeyVaultUri string = operations.outputs.operationsKeyVaultUri
output acrName string = platform.outputs.acrName
output acrLoginServer string = platform.outputs.acrLoginServer
output postgresServerName string = platform.outputs.postgresServerName
output postgresFqdn string = platform.outputs.postgresFqdn
output postgresDatabaseName string = platform.outputs.postgresDatabaseName
output postgresAllowedExtensions string = postgresConfig.outputs.allowedExtensionsValue
output runtimeDeploymentSecretWriteGranted bool = runtimeDeploymentAccess.outputs.deploymentSecretWriteGranted
output operationsDeploymentSecretWriteGranted bool = operationsDeploymentAccess.outputs.deploymentSecretWriteGranted
output applicationInsightsConnectionString string = platform.outputs.applicationInsightsConnectionString
