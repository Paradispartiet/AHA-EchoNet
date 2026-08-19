const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadBrowserModule() {
  const context = { console, Date, Math, JSON, URL, URLSearchParams };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/ahaFysenAuthorization.js', 'utf8'), context, { filename: 'js/ahaFysenAuthorization.js' });
  assert.ok(context.AHAFysenAuthorization, 'browser module should expose window.AHAFysenAuthorization');
  return context.AHAFysenAuthorization;
}

const authz = loadBrowserModule();
const request = authz.requestFromLocation({
  search: '?client_id=fysen&redirect_uri=https%3A%2F%2Ffysen.example%2Fapi%2Faha%2Fcallback&code_challenge=' + 'a'.repeat(64) + '&state=state-123'
});
assert.equal(request.clientId, 'fysen');
assert.equal(request.state, 'state-123');

const location = { assign(value) { this.value = value; } };
authz.returnToFysen(request, { authorizationCode: 'signed.code' }, location);
const returned = new URL(location.value);
assert.equal(returned.searchParams.get('code'), 'signed.code');
assert.equal(returned.searchParams.get('state'), 'state-123');

assert.throws(() => authz.requestFromLocation({ search: '?client_id=evil' }), /Ugyldig Fysen-klient/);
console.log('aha-fysen-authorization passed');
