targetScope = 'resourceGroup'

param postgresServerName string

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' existing = {
  name: postgresServerName
}

resource allowedExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2025-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    source: 'user-override'
    value: 'pgcrypto'
  }
}

output allowedExtensionsValue string = allowedExtensions.properties.value
