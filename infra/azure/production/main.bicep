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

output resourceGroupName string = productionRg.name
output resourceGroupId string = productionRg.id
output containerAppsEnvironmentName string = platform.outputs.containerAppsEnvironmentName
output containerAppsEnvironmentId string = platform.outputs.containerAppsEnvironmentId
output managedIdentityName string = platform.outputs.managedIdentityName
output managedIdentityId string = platform.outputs.managedIdentityId
output keyVaultName string = platform.outputs.keyVaultName
output keyVaultUri string = platform.outputs.keyVaultUri
output acrName string = platform.outputs.acrName
output acrLoginServer string = platform.outputs.acrLoginServer
output postgresServerName string = platform.outputs.postgresServerName
output postgresFqdn string = platform.outputs.postgresFqdn
output postgresDatabaseName string = platform.outputs.postgresDatabaseName
output applicationInsightsConnectionString string = platform.outputs.applicationInsightsConnectionString
