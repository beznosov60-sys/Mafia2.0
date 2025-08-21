const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

function setupDom(html, url) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, { url });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.alert = () => {};
  global.confirm = () => true;
  dom.window.tasks = [];
  return dom;
}

const formHtml = `
  <input id="firstName">
  <input id="middleName">
  <input id="lastName">
  <input id="birthDate">
  <input id="phone">
  <input id="passportSeries">
  <input id="passportNumber">
  <input id="passportIssueDate">
  <input id="passportIssuePlace">
  <input id="totalAmount">
  <input id="paymentMonths">
  <input id="arbitrLink">
  <input id="caseNumber">
  <select id="stage"><option value="stage1">stage1</option></select>
  <input id="courtDate">
  <textarea id="notes"></textarea>
  <input type="checkbox" id="documentsCollected">
`;

test('saveClient adds a new record', () => {
  setupDom(formHtml, 'https://example.com/add-client.html');
  document.getElementById('firstName').value = 'John';
  document.getElementById('lastName').value = 'Doe';
  document.getElementById('stage').value = 'stage1';
  document.getElementById('paymentMonths').value = '0';

  delete require.cache[require.resolve('../app.js')];
  require('../app.js');

  saveClient();

  const clients = JSON.parse(localStorage.getItem('clients'));
  assert.equal(clients.length, 1);
  assert.equal(clients[0].firstName, 'John');
});

test('updateClient updates fields', () => {
  setupDom(formHtml, 'https://example.com/edit-client.html?id=1');
  const existing = {
    id: 1,
    firstName: 'John',
    middleName: '',
    lastName: 'Doe',
    birthDate: '',
    phone: '',
    passportSeries: '',
    passportNumber: '',
    passportIssueDate: '',
    passportIssuePlace: '',
    totalAmount: 0,
    paymentMonths: 0,
    paidMonths: [],
    arbitrLink: '',
    caseNumber: '',
    stage: 'stage1',
    courtDate: '',
    notes: '',
    documentsCollected: false,
    createdAt: new Date().toISOString(),
    tasks: [],
    finManagerPaid: false,
    courtDepositPaid: false
  };
  localStorage.setItem('clients', JSON.stringify([existing]));

  document.getElementById('firstName').value = 'Jane';
  document.getElementById('lastName').value = 'Doe';
  document.getElementById('stage').value = 'stage1';
  document.getElementById('paymentMonths').value = '0';

  delete require.cache[require.resolve('../app.js')];
  require('../app.js');

  updateClient();

  const clients = JSON.parse(localStorage.getItem('clients'));
  assert.equal(clients[0].firstName, 'Jane');
});

test('deleteClient removes client', () => {
  setupDom('', 'https://example.com/edit-client.html?id=1');
  const clients = [
    { id: 1, firstName: 'John', lastName: 'Doe' },
    { id: 2, firstName: 'Alice', lastName: 'Smith' }
  ];
  localStorage.setItem('clients', JSON.stringify(clients));

  delete require.cache[require.resolve('../app.js')];
  require('../app.js');

  deleteClient();

  const remaining = JSON.parse(localStorage.getItem('clients'));
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 2);
});

