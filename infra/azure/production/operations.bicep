targetScope = 'resourceGroup'

param location string
param prefix string
param acrName string
param tags object = {}

var unique = uniqueString(subscription().id, resourceGroup().id, 'operations')
var operationsKeyVaultName = take(toLower('${prefix}-ops-kv-${unique}'), 24)
var migrationIdentityName = '${prefix}-migration-id'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: migrationIdentityName
  location: location
  tags: tags
}

resource operationsKeyVault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: operationsKeyVaultName
  location: location
  tags: union(tags, {
    credentialScope: 'migration-operations-only'
  })
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource migrationKeyVaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(operationsKeyVault.id, migrationIdentity.id, keyVaultSecretsUserRoleDefinitionId)
  scope: operationsKeyVault
  properties: {
    principalId: migrationIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource migrationAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, migrationIdentity.id, acrPullRoleDefinitionId)
  scope: registry
  properties: {
    principalId: migrationIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

output migrationIdentityName string = migrationIdentity.name
output migrationIdentityId string = migrationIdentity.id
output operationsKeyVaultName string = operationsKeyVault.name
output operationsKeyVaultUri string = operationsKeyVault.properties.vaultUri
