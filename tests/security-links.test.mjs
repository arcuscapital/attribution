import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isNonListed} from '../site/arcus-source.mjs';

function links(positions, integrated = true, backTag = 'A') {
  const app = fs.readFileSync('site/app.mjs', 'utf8');
  const source = app.slice(app.indexOf('function buildSecurityLinks('), app.indexOf('function displayedRows('));
  const ctx = vm.createContext({isNonListed, integrated, $: id => id === 'back-arcus' ? {tagName: backTag} : null});
  vm.runInContext(source, ctx);
  return ctx.buildSecurityLinks([{positions}]);
}

test('company links use the verified exchange listing and existing Watchlists route', () => {
  const positions = [{id:'APP', ticker:'APP', symbol:'APP', name:'AppLovin'},
    {id:'2330.TW', ticker:'2330', symbol:'2330.TW', name:'Taiwan Semiconductor'}];
  assert.equal(links(positions).get('APP'), '/?tab=watchlist&symbol=APP');
  assert.equal(links(positions).get('2330.TW'), '/?tab=watchlist&symbol=2330.TW');
  assert.equal(links(positions, false).get('APP'), 'https://arcuscapital.co.za/?tab=watchlist&symbol=APP');
});

test('cash, private, unresolved, malformed and conflicting identities have no company link', () => {
  const positions = [
    {id:'cash', symbol:'USD', asset:'Cash'},
    {id:'private', symbol:'PRIVATE', asset:'Private'},
    {id:'unresolved', ticker:'APP', symbol:null},
    {id:'bad', symbol:'APP&tab=trade'},
    {id:'collision', symbol:'ABC'}, {id:'collision', symbol:'ABC.L'},
  ];
  assert.equal(links(positions).size, 0);
});

test('the Marlow-only login (back link served as an empty span) gets no company links', () => {
  const positions = [{id:'APP', ticker:'APP', symbol:'APP', name:'AppLovin'}];
  assert.equal(links(positions, true, 'A').size, 1);
  assert.equal(links(positions, true, 'SPAN').size, 0);
});
