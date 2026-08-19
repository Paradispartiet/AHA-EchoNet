const assert = require('assert');
const collection = require('../js/ahaFysenFoodCollection.js');

const payload = {
  version: 'fysen_food_collection_v1',
  source: 'fysen',
  purpose: 'user_requested_analysis',
  generatedAt: '2026-08-19T17:00:00.000Z',
  privacy: {
    scope: 'private_user',
    includesSearchHistory: false,
    publicSharing: false,
    modelTrainingAllowed: false
  },
  items: [{
    savedItemId: '11111111-1111-4111-8111-111111111111',
    menuItemId: '22222222-2222-4222-8222-222222222222',
    dishName: 'Daal makhani',
    restaurantName: 'Eksempel',
    restaurantSlug: 'eksempel-oslo',
    city: 'Oslo',
    priceMinor: 19900,
    currency: 'NOK',
    savedAt: '2026-08-19T16:55:00.000Z'
  }]
};

const normalized = collection.normalize(payload);
assert.equal(normalized.items.length, 1);
assert.equal(normalized.privacy.includesSearchHistory, false);
assert.match(collection.buildPrompt(payload), /Daal makhani/);
assert.match(collection.buildPrompt(payload), /inneholder ikke Fysen-søkehistorikk/);
assert.throws(() => collection.normalize({ ...payload, privacy: { ...payload.privacy, includesSearchHistory: true } }), /personverngrensen/);
assert.throws(() => collection.normalize({ ...payload, items: new Array(51).fill(payload.items[0]) }), /for stor/);
console.log('aha-fysen-food-collection passed');
